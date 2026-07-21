import { NextResponse, after } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isWhatsappConfigured, serverConfig } from "@/lib/config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Re-queue ONLY the failed recipients of a campaign: flip their message rows
 * from `failed` back to `pending`, clear the old error, and put the campaign
 * back into `sending`. The existing batch loop + server-side auto-advance then
 * send exactly those recipients — nobody who already received the message is
 * contacted again.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { user } = await getSessionUser();
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

  const supabase = createAdminClient();

  const { data: campaign, error: campaignError } = await supabase
    .from("campaigns")
    .select("id")
    .eq("id", campaignId)
    .single();

  if (campaignError || !campaign) {
    return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  }

  // Flip failed -> pending and return how many were re-queued.
  const { data: requeued, error: requeueError } = await supabase
    .from("messages")
    .update({ status: "pending", error: null, wa_message_id: null })
    .eq("campaign_id", campaignId)
    .eq("status", "failed")
    .select("id");

  if (requeueError) {
    return NextResponse.json({ error: requeueError.message }, { status: 500 });
  }

  const requeuedCount = requeued?.length ?? 0;

  if (requeuedCount === 0) {
    return NextResponse.json({ requeued: 0, total: 0, done: true });
  }

  // Reopen the campaign so the batch loop will process it again.
  const [{ count: pending }, { count: sent }] = await Promise.all([
    supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", campaignId)
      .eq("status", "pending"),
    supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", campaignId)
      .in("status", ["sent", "delivered", "read"]),
  ]);

  await supabase
    .from("campaigns")
    .update({ status: "sending", sent_at: null })
    .eq("id", campaignId);

  // Kick off the server-side auto-advance chain immediately.
  const origin = new URL(req.url).origin;
  after(async () => {
    try {
      await fetch(`${origin}/api/campaigns/${campaignId}/send-batch?auto=1`, {
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
    requeued: requeuedCount,
    total: (pending ?? 0) + (sent ?? 0),
    pending: pending ?? 0,
    done: false,
  });
}
