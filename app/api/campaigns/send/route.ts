import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { sendCampaignSchema } from "@/lib/validation";
import { isMediaHeader, resolveTemplate, sendTemplateMessage } from "@/lib/whatsapp";
import { isWhatsappConfigured, publicConfig } from "@/lib/config";
import type { Contact } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Allow up to 60s on Vercel for medium batches. For very large lists, send in
// multiple campaigns or move sending to a background worker (see README).
export const maxDuration = 60;

// Higher concurrency clears large batches within Vercel's 60s window. Meta's
// per-number rate limit is high (80 msg/s default) so this stays well under it;
// transient rate-limit errors are retried inside sendTemplateMessage.
const CONCURRENCY = 10;

export async function POST(req: Request) {
  const { supabase, user } = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isWhatsappConfigured()) {
    return NextResponse.json(
      {
        error:
          "WhatsApp is not configured. Set WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID.",
      },
      { status: 400 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = sendCampaignSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input." },
      { status: 400 },
    );
  }

  // Resolve the requested template against the live WABA list. The client only
  // sends a name, so this both validates the choice (an unapproved or deleted
  // template would fail per-contact with an opaque Meta error) and gives us the
  // component shape to build each payload from.
  const templateName =
    parsed.data.templateName || publicConfig.whatsappTemplateName;
  const template = await resolveTemplate(templateName, parsed.data.templateLang);

  if (!template) {
    return NextResponse.json(
      {
        error:
          `Template "${templateName}" was not found among the approved templates ` +
          `on this WhatsApp Business Account. Pick another template, or check its ` +
          `status in WhatsApp Manager.`,
      },
      { status: 400 },
    );
  }

  // Header media only applies to templates whose header is IMAGE/VIDEO/DOCUMENT.
  // For a TEXT or headerless template we must send no media at all.
  const wantsMedia = isMediaHeader(template.headerFormat);
  const mediaUrl = !wantsMedia
    ? ""
    : parsed.data.imageUrl && parsed.data.imageUrl.length > 0
      ? parsed.data.imageUrl
      : publicConfig.whatsappImageUrl;

  if (wantsMedia && !mediaUrl) {
    return NextResponse.json(
      {
        error:
          `Template "${template.name}" has a ${template.headerFormat} header. ` +
          `Add a header ${template.headerFormat.toLowerCase()} URL before sending.`,
      },
      { status: 400 },
    );
  }

  // Load recipients — restricted to the selected contact ids.
  const { data: contactsData, error: contactsError } = await supabase
    .from("contacts")
    .select("id, name, phone, token")
    .in("id", parsed.data.contactIds)
    .order("created_at", { ascending: true });

  if (contactsError) {
    return NextResponse.json({ error: contactsError.message }, { status: 500 });
  }

  const contacts = (contactsData ?? []) as Pick<
    Contact,
    "id" | "name" | "phone" | "token"
  >[];

  if (contacts.length === 0) {
    return NextResponse.json(
      { error: "No matching contacts to message. Select at least one contact." },
      { status: 400 },
    );
  }

  // Create the campaign row up front (status: sending).
  const { data: campaign, error: campaignError } = await supabase
    .from("campaigns")
    .insert({
      name: parsed.data.name,
      template_name: template.name,
      image_url: mediaUrl || null,
      form_base_url: `${publicConfig.appUrl}/form/`,
      // Record the template's real body text, so the history reflects what was
      // actually sent even after the template is later edited in Meta.
      message_body: template.bodyText,
      total_contacts: contacts.length,
      status: "sending",
      created_by: user.id,
    })
    .select("id")
    .single();

  if (campaignError || !campaign) {
    return NextResponse.json(
      { error: campaignError?.message ?? "Could not create campaign." },
      { status: 500 },
    );
  }

  // Send with limited concurrency.
  type Outcome = {
    contact: (typeof contacts)[number];
    status: "sent" | "failed";
    messageId?: string;
    error?: string;
  };
  const outcomes: Outcome[] = new Array(contacts.length);
  let cursor = 0;

  // Arrow function (not a hoisted declaration) so the narrowed, non-null
  // `template` from the guard above stays visible inside the closure.
  const worker = async () => {
    while (cursor < contacts.length) {
      const i = cursor++;
      const c = contacts[i];
      const result = await sendTemplateMessage({
        to: c.phone,
        customerName: c.name,
        token: c.token,
        template,
        mediaUrl,
      });
      outcomes[i] = {
        contact: c,
        status: result.status,
        messageId: result.messageId,
        error: result.error,
      };
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, contacts.length) }, () =>
      worker(),
    ),
  );

  // Persist per-contact message rows.
  const messageRows = outcomes.map((o) => ({
    campaign_id: campaign.id,
    contact_id: o.contact.id,
    phone: o.contact.phone,
    wa_message_id: o.messageId ?? null,
    status: o.status,
    error: o.error ?? null,
  }));

  const { error: messagesError } = await supabase
    .from("messages")
    .insert(messageRows);
  if (messagesError) {
    // Non-fatal: messages couldn't be logged, but sends may have happened.
    console.error("Failed to insert message rows:", messagesError.message);
  }

  const sent = outcomes.filter((o) => o.status === "sent").length;
  const failed = outcomes.length - sent;

  await supabase
    .from("campaigns")
    .update({
      messages_sent: sent,
      messages_failed: failed,
      status: sent > 0 ? "completed" : "failed",
      sent_at: new Date().toISOString(),
    })
    .eq("id", campaign.id);

  return NextResponse.json({
    campaignId: campaign.id,
    total: contacts.length,
    sent,
    failed,
    // Surface a sample error to help debugging template/setup issues.
    sampleError: outcomes.find((o) => o.status === "failed")?.error ?? null,
  });
}
