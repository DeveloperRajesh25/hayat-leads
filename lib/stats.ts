import type { SupabaseClient } from "@supabase/supabase-js";
import type { DashboardStats } from "./types";

type Client = SupabaseClient;

/** Stat cards that support an individual "reset to zero" baseline. */
export const RESETTABLE_STATS = [
  "totalContacts",
  "messagesSent",
  "delivered",
  "failed",
  "pending",
  "interested",
  "notInterested",
  "converted",
  "totalResponses",
] as const;

export type StatKey = (typeof RESETTABLE_STATS)[number];

/**
 * Load any per-card reset baselines. Returns a map of statKey -> ISO timestamp;
 * a stat with a baseline only counts rows created after that moment. Tolerates
 * the `stat_resets` table not existing yet (returns an empty map) so the
 * dashboard keeps working before the migration is applied.
 */
export async function getResets(supabase: Client): Promise<Partial<Record<StatKey, string>>> {
  const { data, error } = await supabase
    .from("stat_resets")
    .select("stat_key, reset_at");
  if (error || !data) return {};
  const map: Partial<Record<StatKey, string>> = {};
  for (const row of data as { stat_key: string; reset_at: string }[]) {
    map[row.stat_key as StatKey] = row.reset_at;
  }
  return map;
}

type CountBuilder = (
  q: ReturnType<ReturnType<Client["from"]>["select"]>,
) => ReturnType<ReturnType<Client["from"]>["select"]>;

/** Count rows in a table, applying an optional filter and reset baseline. */
async function count(
  supabase: Client,
  table: string,
  resetAt: string | undefined,
  build?: CountBuilder,
): Promise<number> {
  let q = supabase.from(table).select("*", { count: "exact", head: true });
  if (build) q = build(q);
  if (resetAt) q = q.gt("created_at", resetAt);
  const { count: c, error } = await q;
  if (error) throw error;
  return c ?? 0;
}

/**
 * Compute the dashboard overview statistics with a handful of cheap
 * count-only queries. Used by both the dashboard Server Component and the
 * /api/stats route so the numbers always match.
 *
 * Each card can be reset individually (see `stat_resets`) — a reset simply
 * makes that card ignore rows created before the reset moment.
 */
export async function getDashboardStats(
  supabase: Client,
): Promise<DashboardStats> {
  const resets = await getResets(supabase);

  const [
    totalContacts,
    totalResponses,
    totalCampaigns,
    messagesSent,
    delivered,
    failed,
    interested,
    notInterested,
    converted,
    // For pending we count contacts and responses under the "pending" baseline.
    pendingContacts,
    pendingResponses,
  ] = await Promise.all([
    count(supabase, "contacts", resets.totalContacts),
    count(supabase, "responses", resets.totalResponses),
    count(supabase, "campaigns", undefined),
    count(supabase, "messages", resets.messagesSent, (q) =>
      q.in("status", ["sent", "delivered", "read"]),
    ),
    count(supabase, "messages", resets.delivered, (q) =>
      q.in("status", ["delivered", "read"]),
    ),
    count(supabase, "messages", resets.failed, (q) =>
      q.eq("status", "failed"),
    ),
    count(supabase, "responses", resets.interested, (q) =>
      q.eq("interest_status", "interested"),
    ),
    count(supabase, "responses", resets.notInterested, (q) =>
      q.eq("interest_status", "not_interested"),
    ),
    count(supabase, "responses", resets.converted, (q) =>
      q.eq("converted", true),
    ),
    count(supabase, "contacts", resets.pending),
    count(supabase, "responses", resets.pending),
  ]);

  // Pending = contacts we reached out to that have not responded yet.
  const pending = Math.max(pendingContacts - pendingResponses, 0);

  return {
    totalContacts,
    messagesSent,
    delivered,
    failed,
    interested,
    notInterested,
    pending,
    totalResponses,
    totalCampaigns,
    converted,
  };
}
