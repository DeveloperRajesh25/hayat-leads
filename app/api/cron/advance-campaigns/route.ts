import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { serverConfig } from "@/lib/config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Safety net that guarantees no campaign is ever left half-sent.
 *
 * The send route starts a server-side auto-advance chain, and the browser loop
 * drives it too — but a cold start, a deploy mid-run, or a hard rate limit can
 * stand that chain down. This endpoint, hit on a schedule (Vercel Cron or any
 * external cron), finds every campaign still `sending` with recipients pending
 * and re-ignites its auto-advance chain. Recipients already sent are never
 * touched again (each pending row is claimed exactly once).
 *
 * Auth: Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. An external
 * cron can instead send `x-internal-key: <service role key>`.
 */
function authorized(req: Request): boolean {
  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (cronSecret && auth === `Bearer ${cronSecret}`) return true;

  const internalKey = req.headers.get("x-internal-key");
  if (internalKey && internalKey === serverConfig.supabaseServiceRoleKey)
    return true;

  return false;
}

async function handle(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const origin = new URL(req.url).origin;

  // Campaigns still in flight.
  const { data: sending, error } = await supabase
    .from("campaigns")
    .select("id")
    .eq("status", "sending")
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const ids = (sending ?? []).map((c) => c.id);
  if (ids.length === 0) {
    return NextResponse.json({ advanced: 0 });
  }

  // Only re-ignite ones that actually have pending work left.
  const advanced: string[] = [];
  await Promise.all(
    ids.map(async (id) => {
      const { count } = await supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", id)
        .eq("status", "pending");
      if ((count ?? 0) === 0) return;
      advanced.push(id);
      try {
        await fetch(`${origin}/api/campaigns/${id}/send-batch?auto=1`, {
          method: "POST",
          headers: {
            "x-internal-key": serverConfig.supabaseServiceRoleKey,
            "x-advance-depth": "0",
            "x-throttle-streak": "0",
          },
          cache: "no-store",
        });
      } catch {
        // Next cron tick will retry.
      }
    }),
  );

  return NextResponse.json({ advanced: advanced.length, campaigns: advanced });
}

// Vercel Cron issues GET; allow POST too for manual/external triggers.
export async function GET(req: Request) {
  return handle(req);
}
export async function POST(req: Request) {
  return handle(req);
}
