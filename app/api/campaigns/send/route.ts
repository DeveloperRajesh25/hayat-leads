import { NextResponse, after } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { sendCampaignSchema } from "@/lib/validation";
import { isMediaHeader, resolveTemplate } from "@/lib/whatsapp";
import { isWhatsappConfigured, publicConfig, serverConfig } from "@/lib/config";
import type { Contact } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Creates the campaign and queues one `messages` row per contact (status
 * "pending"). It does NOT talk to WhatsApp — actual sending happens in small,
 * repeated calls to /api/campaigns/[id]/send-batch, driven by the client (see
 * lib/campaign-batch-client.ts). Sending 500 contacts synchronously here used
 * to blow past Vercel's 60s function limit and lose all progress when killed
 * mid-batch; queuing up front and sending in bounded batches keeps every
 * request fast and makes progress durable and resumable.
 */
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

  // Load recipients — restricted to the selected contact ids. Chunked because
  // Supabase builds `.in()` as a GET request with the ids in the query string;
  // a large selection (hundreds of contacts) can exceed the URL length limit
  // and come back as a bare "Bad Request" from the API gateway.
  const CONTACT_LOOKUP_CHUNK = 150;
  const contactsData: Pick<Contact, "id" | "name" | "phone" | "token">[] = [];
  for (let i = 0; i < parsed.data.contactIds.length; i += CONTACT_LOOKUP_CHUNK) {
    const idsChunk = parsed.data.contactIds.slice(i, i + CONTACT_LOOKUP_CHUNK);
    const { data, error } = await supabase
      .from("contacts")
      .select("id, name, phone, token")
      .in("id", idsChunk)
      .order("created_at", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    contactsData.push(...((data ?? []) as Pick<Contact, "id" | "name" | "phone" | "token">[]));
  }

  const contacts = contactsData;

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
      template_lang: template.language,
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

  // Queue every contact as a pending message row. The batch endpoint claims
  // and sends these a page at a time, so this insert is the only thing that
  // needs to happen inside this request.
  const messageRows = contacts.map((c) => ({
    campaign_id: campaign.id,
    contact_id: c.id,
    phone: c.phone,
    status: "pending" as const,
  }));

  const { error: messagesError } = await supabase
    .from("messages")
    .insert(messageRows);

  if (messagesError) {
    // Roll the campaign back to failed — nothing was queued, so there's
    // nothing for the batch endpoint to send.
    await supabase
      .from("campaigns")
      .update({ status: "failed" })
      .eq("id", campaign.id);
    return NextResponse.json({ error: messagesError.message }, { status: 500 });
  }

  // Start a server-side auto-advance chain so the campaign finishes on its own,
  // even if the admin closes the tab right after hitting Send. The browser loop
  // (see lib/campaign-batch-client.ts) runs in parallel for live progress; both
  // are safe together because each pending row is claimed exactly once.
  const origin = new URL(req.url).origin;
  after(async () => {
    try {
      await fetch(`${origin}/api/campaigns/${campaign.id}/send-batch?auto=1`, {
        method: "POST",
        headers: {
          "x-internal-key": serverConfig.supabaseServiceRoleKey,
          "x-advance-depth": "0",
          "x-throttle-streak": "0",
        },
        cache: "no-store",
      });
    } catch {
      // Best-effort; the browser loop / manual resume still complete the run.
    }
  });

  return NextResponse.json({
    campaignId: campaign.id,
    total: contacts.length,
  });
}
