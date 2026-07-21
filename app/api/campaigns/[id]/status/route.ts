import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCampaignStats } from "@/lib/campaign-stats";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Live delivery breakdown for one campaign, counted straight from the messages
 * rows (single source of truth). Drives the live send panel's polling, so the
 * numbers on screen are always the real ones — never a cached guess.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { user } = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: campaignId } = await params;
  if (!campaignId) {
    return NextResponse.json({ error: "Missing campaign id." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: campaign, error } = await admin
    .from("campaigns")
    .select("id, name, status")
    .eq("id", campaignId)
    .single();

  if (error || !campaign) {
    return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  }

  const stats = await getCampaignStats(campaignId);

  // Surface WHY messages failed, right in the panel — so a wall of "failed" is
  // never a mystery. WhatsApp accepts a message first and may reject delivery
  // later; the reason it gives lives on each failed row.
  let failureReasons: { reason: string; count: number }[] = [];
  if (stats.failed > 0) {
    const { data: rows } = await admin
      .from("messages")
      .select("error")
      .eq("campaign_id", campaignId)
      .eq("status", "failed")
      .not("error", "is", null)
      .limit(500);
    const counts = new Map<string, number>();
    for (const r of rows ?? []) {
      const reason = (r.error ?? "").trim();
      if (!reason) continue;
      counts.set(reason, (counts.get(reason) ?? 0) + 1);
    }
    failureReasons = Array.from(counts, ([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);
  }

  // A campaign is only truly finished when nothing is pending. This is derived,
  // not trusted from a column, so it can't disagree with the counts.
  const done = stats.pending === 0;

  return NextResponse.json({
    campaignId: campaign.id,
    name: campaign.name,
    status: campaign.status,
    done,
    failureReasons,
    ...stats,
  });
}
