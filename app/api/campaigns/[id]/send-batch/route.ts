import { NextResponse, after } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveTemplate, sendTemplateMessage } from "@/lib/whatsapp";
import { isWhatsappConfigured, serverConfig } from "@/lib/config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// One call only ever processes BATCH_SIZE contacts, so it comfortably
// finishes well inside this limit even if every send needs its full set of
// retries (see sendTemplateMessage). Both the browser loop AND a server-side
// auto-advance chain call this repeatedly until `done`, so a campaign of any
// size completes as a series of small, safe requests instead of one long one
// that Vercel would kill.
export const maxDuration = 60;

const BATCH_SIZE = 40;
// A little gentler than before: sending too wide is exactly what trips
// WhatsApp's number-level rate limits and turns a healthy run into a wall of
// throttles. 6-wide still clears 40 contacts in a few seconds.
const CONCURRENCY = 6;

// Auto-advance (server-side self-chaining) safety rails.
const MAX_ADVANCE_DEPTH = 400; // 400 * 40 = 16k contacts — far above any real list
const MAX_THROTTLE_STREAK = 4; // stop self-chaining after this many all-throttled rounds
const AUTO_PACING_MS = 1500; // brief pause between auto batches to stay under rate limits

type AdminClient = ReturnType<typeof createAdminClient>;

interface PendingRow {
  id: string;
  contact_id: string | null;
  phone: string;
  contact: { name: string; token: string } | null;
}

async function tally(supabase: AdminClient, campaignId: string) {
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
async function finalize(supabase: AdminClient, campaignId: string) {
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

/**
 * Fire the next batch server-side, so a campaign keeps draining even if the
 * browser tab that started it is closed. This is best-effort: if it fails
 * (e.g. a cold start eats the request), the browser loop and the manual
 * "Resume" button are still there to finish the job. Nothing is ever lost
 * because every unsent recipient stays `pending`.
 */
function scheduleAutoAdvance(
  origin: string,
  campaignId: string,
  depth: number,
  throttleStreak: number,
  delayMs: number,
) {
  after(async () => {
    try {
      if (delayMs > 0) {
        await new Promise((r) => setTimeout(r, delayMs));
      }
      await fetch(`${origin}/api/campaigns/${campaignId}/send-batch?auto=1`, {
        method: "POST",
        headers: {
          "x-internal-key": serverConfig.supabaseServiceRoleKey,
          "x-advance-depth": String(depth),
          "x-throttle-streak": String(throttleStreak),
        },
        cache: "no-store",
      });
    } catch {
      // Swallow — the browser loop / manual resume will pick it up.
    }
  });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  // Two ways in:
  //  - a logged-in admin (the browser send/resume loop), or
  //  - the server-side auto-advance chain, authenticated with the internal key.
  const internalKey = req.headers.get("x-internal-key");
  const isInternal =
    !!internalKey && internalKey === serverConfig.supabaseServiceRoleKey;

  let supabase: AdminClient;
  if (isInternal) {
    supabase = createAdminClient();
  } else {
    const session = await getSessionUser();
    if (!session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    // Use the privileged client for the write path so an interrupted session
    // token can never strand a half-sent campaign; the caller is already
    // authenticated above.
    supabase = createAdminClient();
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

  const url = new URL(req.url);
  const isAuto = url.searchParams.get("auto") === "1";
  const origin = url.origin;
  const depth = Number(req.headers.get("x-advance-depth") ?? "0") || 0;
  const throttleStreak =
    Number(req.headers.get("x-throttle-streak") ?? "0") || 0;

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
  // work, so every caller is always safe to retry.
  if (campaign.status !== "sending") {
    const totals = await tally(supabase, campaignId);
    return NextResponse.json({
      done: true,
      campaignStatus: campaign.status,
      totalSent: totals.sent,
      totalFailed: totals.failed,
      remainingPending: totals.pending,
      throttled: false,
      throttledCount: 0,
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
  let throttledCount = 0;
  let sentThisBatch = 0;

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

        // A transient throttle must NOT overwrite the row: leaving it `pending`
        // is exactly what makes the recipient retryable instead of lost. We
        // only record the reason for diagnostics.
        if (result.status === "throttled") {
          throttledCount++;
          sampleError ??= result.error ?? null;
          continue;
        }

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

        if (result.status === "sent") sentThisBatch++;
        else if (result.status === "failed") sampleError ??= result.error ?? null;
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, pending.length) }, () =>
        worker(),
      ),
    );
  }

  const totals = await finalize(supabase, campaignId);

  // A round where every attempt was throttled and nothing moved forward means
  // the number is being rate-limited hard right now. Count the streak so the
  // auto-advance chain can back off and eventually stand down (leaving the rest
  // pending for a later resume) instead of hammering a throttled number.
  const madeProgress = sentThisBatch > 0;
  const nextThrottleStreak =
    throttledCount > 0 && !madeProgress ? throttleStreak + 1 : 0;

  // Server-side self-chaining: keep the campaign draining without the browser.
  // Only the internal auto chain re-fires itself (so a campaign has exactly one
  // server-side driver); the browser loop drives itself.
  if (
    isAuto &&
    !totals.done &&
    depth < MAX_ADVANCE_DEPTH &&
    nextThrottleStreak < MAX_THROTTLE_STREAK
  ) {
    const delay =
      nextThrottleStreak > 0
        ? Math.min(3000 * nextThrottleStreak, 9000)
        : AUTO_PACING_MS;
    scheduleAutoAdvance(
      origin,
      campaignId,
      depth + 1,
      nextThrottleStreak,
      delay,
    );
  }

  return NextResponse.json({
    done: totals.done,
    campaignStatus: totals.status,
    totalSent: totals.sent,
    totalFailed: totals.failed,
    remainingPending: totals.pending,
    throttled: throttledCount > 0 && !madeProgress,
    throttledCount,
    sampleError,
  });
}
