import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { resolveTemplate, sendTemplateMessage } from "@/lib/whatsapp";
import { isWhatsappConfigured } from "@/lib/config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// One call only ever processes BATCH_SIZE contacts, so it comfortably
// finishes well inside this limit even if every send needs its full set of
// retries (see sendTemplateMessage). The client calls this repeatedly until
// `done` comes back true, so a campaign of any size completes as a series of
// small, safe requests instead of one long one that Vercel would kill.
export const maxDuration = 60;

const BATCH_SIZE = 40;
const CONCURRENCY = 10;

type SupabaseClient = Awaited<ReturnType<typeof getSessionUser>>["supabase"];

interface PendingRow {
  id: string;
  contact_id: string | null;
  phone: string;
  contact: { name: string; token: string } | null;
}

async function tally(supabase: SupabaseClient, campaignId: string) {
  const [{ count: sent }, { count: failed }, { count: pending }] =
    await Promise.all([
      supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", campaignId)
        .in("status", ["sent", "delivered", "read"]),
      supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", campaignId)
        .eq("status", "failed"),
      supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", campaignId)
        .eq("status", "pending"),
    ]);
  return { sent: sent ?? 0, failed: failed ?? 0, pending: pending ?? 0 };
}

/** Recompute totals and, once nothing is left pending, close the campaign out. */
async function finalize(supabase: SupabaseClient, campaignId: string) {
  const totals = await tally(supabase, campaignId);
  if (totals.pending === 0) {
    const status = totals.sent > 0 ? "completed" : "failed";
    await supabase
      .from("campaigns")
      .update({
        status,
        messages_sent: totals.sent,
        messages_failed: totals.failed,
        sent_at: new Date().toISOString(),
      })
      .eq("id", campaignId);
    return { ...totals, done: true, status };
  }
  await supabase
    .from("campaigns")
    .update({ messages_sent: totals.sent, messages_failed: totals.failed })
    .eq("id", campaignId);
  return { ...totals, done: false, status: "sending" as const };
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
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

  const { id: campaignId } = await params;
  if (!campaignId) {
    return NextResponse.json({ error: "Missing campaign id." }, { status: 400 });
  }

  const { data: campaign, error: campaignError } = await supabase
    .from("campaigns")
    .select("id, template_name, template_lang, image_url, status")
    .eq("id", campaignId)
    .single();

  if (campaignError || !campaign) {
    return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  }

  // Already finished — by a previous call, or a concurrent one (e.g. a
  // double-clicked "Resume"). Report the current tallies instead of doing any
  // work, so the client loop is always safe to retry.
  if (campaign.status !== "sending") {
    const totals = await tally(supabase, campaignId);
    return NextResponse.json({
      done: true,
      campaignStatus: campaign.status,
      totalSent: totals.sent,
      totalFailed: totals.failed,
      remainingPending: totals.pending,
    });
  }

  const template = await resolveTemplate(
    campaign.template_name,
    campaign.template_lang ?? undefined,
  );

  if (!template) {
    await supabase
      .from("campaigns")
      .update({ status: "failed", sent_at: new Date().toISOString() })
      .eq("id", campaignId);
    return NextResponse.json(
      {
        error: `Template "${campaign.template_name}" is no longer available (deleted or unapproved on the WhatsApp Business Account).`,
      },
      { status: 400 },
    );
  }

  const { data: pendingData, error: pendingError } = await supabase
    .from("messages")
    .select("id, contact_id, phone, contact:contacts(name, token)")
    .eq("campaign_id", campaignId)
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (pendingError) {
    return NextResponse.json({ error: pendingError.message }, { status: 500 });
  }

  const pending = (pendingData ?? []) as unknown as PendingRow[];
  let sampleError: string | null = null;

  if (pending.length > 0) {
    let cursor = 0;

    const worker = async () => {
      while (cursor < pending.length) {
        const row = pending[cursor++];

        if (!row.contact_id || !row.contact) {
          const error = "Contact no longer exists.";
          await supabase
            .from("messages")
            .update({ status: "failed", error })
            .eq("id", row.id)
            .eq("status", "pending");
          sampleError ??= error;
          continue;
        }

        const result = await sendTemplateMessage({
          to: row.phone,
          customerName: row.contact.name,
          token: row.contact.token,
          template,
          mediaUrl: campaign.image_url ?? undefined,
        });

        // The `.eq("status", "pending")` guard means a row already claimed by
        // a concurrent call never gets overwritten with a second outcome.
        await supabase
          .from("messages")
          .update({
            status: result.status,
            wa_message_id: result.messageId ?? null,
            error: result.error ?? null,
          })
          .eq("id", row.id)
          .eq("status", "pending");

        if (result.status === "failed") sampleError ??= result.error ?? null;
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, pending.length) }, () =>
        worker(),
      ),
    );
  }

  const totals = await finalize(supabase, campaignId);

  return NextResponse.json({
    done: totals.done,
    campaignStatus: totals.status,
    totalSent: totals.sent,
    totalFailed: totals.failed,
    remainingPending: totals.pending,
    sampleError,
  });
}
