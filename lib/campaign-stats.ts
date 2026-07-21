import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { CampaignStats } from "@/lib/types";

type AdminClient = ReturnType<typeof createAdminClient>;

interface StatsRow {
  campaign_id: string;
  total: number | null;
  pending: number | null;
  sent: number | null;
  delivered: number | null;
  read: number | null;
  failed: number | null;
}

function rollup(r: {
  total: number;
  pending: number;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
}): CampaignStats {
  return {
    ...r,
    accepted: r.sent + r.delivered + r.read,
    deliveredTotal: r.delivered + r.read,
  };
}

const EMPTY = (total = 0): CampaignStats =>
  rollup({ total, pending: total, sent: 0, delivered: 0, read: 0, failed: 0 });

/**
 * Live per-campaign delivery breakdown, counted from the `messages` rows.
 *
 * Prefers the `campaign_stats` view (one query for any number of campaigns). If
 * that view hasn't been created yet, it falls back to counting per campaign so
 * the app still works — just apply supabase/schema.sql to get the fast path.
 */
export async function getCampaignStatsMap(
  campaignIds: string[],
): Promise<Map<string, CampaignStats>> {
  const map = new Map<string, CampaignStats>();
  if (campaignIds.length === 0) return map;

  const admin = createAdminClient();

  const { data, error } = await admin
    .from("campaign_stats")
    .select("campaign_id, total, pending, sent, delivered, read, failed")
    .in("campaign_id", campaignIds);

  if (!error && data) {
    for (const row of data as StatsRow[]) {
      map.set(
        row.campaign_id,
        rollup({
          total: row.total ?? 0,
          pending: row.pending ?? 0,
          sent: row.sent ?? 0,
          delivered: row.delivered ?? 0,
          read: row.read ?? 0,
          failed: row.failed ?? 0,
        }),
      );
    }
    // Fill any campaign with no message rows yet.
    for (const id of campaignIds) if (!map.has(id)) map.set(id, EMPTY());
    return map;
  }

  // Fallback: the view doesn't exist. Count each campaign directly.
  await Promise.all(
    campaignIds.map(async (id) => {
      map.set(id, await countCampaign(admin, id));
    }),
  );
  return map;
}

/** Live breakdown for a single campaign (used by the status endpoint). */
export async function getCampaignStats(
  campaignId: string,
): Promise<CampaignStats> {
  const map = await getCampaignStatsMap([campaignId]);
  return map.get(campaignId) ?? EMPTY();
}

async function countCampaign(
  admin: AdminClient,
  campaignId: string,
): Promise<CampaignStats> {
  const status = (s: string) =>
    admin
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", campaignId)
      .eq("status", s);

  const [pending, sent, delivered, read, failed] = await Promise.all([
    status("pending"),
    status("sent"),
    status("delivered"),
    status("read"),
    status("failed"),
  ]);

  const p = pending.count ?? 0;
  const s = sent.count ?? 0;
  const d = delivered.count ?? 0;
  const r = read.count ?? 0;
  const f = failed.count ?? 0;
  return rollup({
    total: p + s + d + r + f,
    pending: p,
    sent: s,
    delivered: d,
    read: r,
    failed: f,
  });
}
