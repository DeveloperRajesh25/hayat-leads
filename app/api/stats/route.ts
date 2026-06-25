import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getDashboardStats } from "@/lib/stats";

export const dynamic = "force-dynamic";

export async function GET() {
  const { supabase, user } = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const stats = await getDashboardStats(supabase);
    return NextResponse.json({ stats });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to load statistics";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
