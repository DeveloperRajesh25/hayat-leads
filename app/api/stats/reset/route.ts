import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { RESETTABLE_STATS, type StatKey } from "@/lib/stats";

export const dynamic = "force-dynamic";

/**
 * Reset a single dashboard stat card back to zero. We record the current
 * moment as that card's baseline; from now on the card only counts rows
 * created after this timestamp.
 */
export async function POST(req: Request) {
  const { supabase, user } = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const key = (body as { key?: string })?.key;
  if (!key || !RESETTABLE_STATS.includes(key as StatKey)) {
    return NextResponse.json({ error: "Unknown stat key." }, { status: 400 });
  }

  const { error } = await supabase
    .from("stat_resets")
    .upsert(
      { stat_key: key, reset_at: new Date().toISOString() },
      { onConflict: "stat_key" },
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
