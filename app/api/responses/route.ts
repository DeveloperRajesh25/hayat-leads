import { NextResponse } from "next/server";
import { responseSchema } from "@/lib/validation";
import { normalizePhone } from "@/lib/phone";
import { createAdminClient } from "@/lib/supabase/admin";
import { publicConfig } from "@/lib/config";

// Public endpoint — no auth. Uses the service role to bypass RLS for an
// anonymous customer submission.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  // Honeypot: silently accept bot submissions without storing anything.
  if (
    body &&
    typeof body === "object" &&
    "company" in body &&
    String((body as { company?: unknown }).company ?? "") !== ""
  ) {
    return NextResponse.json({ ok: true });
  }

  const parsed = responseSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input." },
      { status: 400 },
    );
  }

  const phone = normalizePhone(
    parsed.data.phone,
    publicConfig.defaultCountryCode,
  );
  if (!phone) {
    return NextResponse.json(
      { error: "Please enter a valid phone number." },
      { status: 400 },
    );
  }

  try {
    const admin = createAdminClient();

    // Try to associate this response with an existing contact.
    let contactId: string | null = null;
    if (parsed.data.token) {
      const { data: byToken } = await admin
        .from("contacts")
        .select("id")
        .eq("token", parsed.data.token)
        .maybeSingle();
      contactId = byToken?.id ?? null;
    }
    if (!contactId) {
      const { data: byPhone } = await admin
        .from("contacts")
        .select("id")
        .eq("phone", phone)
        .maybeSingle();
      contactId = byPhone?.id ?? null;
    }

    // Upsert by phone: update the existing response if the customer resubmits.
    const { error } = await admin.from("responses").upsert(
      {
        contact_id: contactId,
        name: parsed.data.name,
        phone,
        interest_status: parsed.data.interest_status,
        requirement_details: parsed.data.requirement_details || null,
        notes: parsed.data.notes || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "phone" },
    );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Server is not configured.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
