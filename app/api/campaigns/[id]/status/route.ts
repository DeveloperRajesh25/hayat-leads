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

  // A campaign is only truly finished when nothing is pending. This is derived,
  // not trusted from a column, so it can't disagree with the counts.
  const done = stats.pending === 0;

  return NextResponse.json({
    campaignId: campaign.id,
    name: campaign.name,
    status: campaign.status,
    done,
    ...stats,
  });
}
