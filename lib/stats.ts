import type { SupabaseClient } from "@supabase/supabase-js";
import type { DashboardStats } from "./types";

type Client = SupabaseClient;

async function countAll(supabase: Client, table: string): Promise<number> {
  const { count, error } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true });
  if (error) throw error;
  return count ?? 0;
}

/**
 * Compute the dashboard overview statistics with a handful of cheap
 * count-only queries. Used by both the dashboard Server Component and the
 * /api/stats route so the numbers always match.
 */
export async function getDashboardStats(
  supabase: Client,
): Promise<DashboardStats> {
  const [
    totalContacts,
    totalResponses,
    totalCampaigns,
    messagesSent,
    interested,
    notInterested,
  ] = await Promise.all([
    countAll(supabase, "contacts"),
    countAll(supabase, "responses"),
    countAll(supabase, "campaigns"),
    supabase
      .from("messages")
      .select("*", { count: "exact", head: true })
      .in("status", ["sent", "delivered", "read"])
      .then(({ count, error }) => {
        if (error) throw error;
        return count ?? 0;
      }),
    supabase
      .from("responses")
      .select("*", { count: "exact", head: true })
      .eq("interest_status", "interested")
      .then(({ count, error }) => {
        if (error) throw error;
        return count ?? 0;
      }),
    supabase
      .from("responses")
      .select("*", { count: "exact", head: true })
      .eq("interest_status", "not_interested")
      .then(({ count, error }) => {
        if (error) throw error;
        return count ?? 0;
      }),
  ]);

  // Pending = contacts we reached out to that have not responded yet.
  const pending = Math.max(totalContacts - totalResponses, 0);

  return {
    totalContacts,
    messagesSent,
    interested,
    notInterested,
    pending,
    totalResponses,
    totalCampaigns,
  };
}
