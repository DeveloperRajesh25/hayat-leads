import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { parseContactsCsv } from "@/lib/csv";
import { generateToken } from "@/lib/utils";
import { publicConfig } from "@/lib/config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

export async function POST(req: Request) {
  const { supabase, user } = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let file: File | null = null;
  try {
    const form = await req.formData();
    const f = form.get("file");
    if (f instanceof File) file = f;
  } catch {
    return NextResponse.json(
      { error: "Expected a multipart form upload with a 'file' field." },
      { status: 400 },
    );
  }

  if (!file) {
    return NextResponse.json({ error: "No CSV file provided." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "File too large. Maximum size is 5 MB." },
      { status: 400 },
    );
  }

  const text = await file.text();
  const parsed = parseContactsCsv(text, publicConfig.defaultCountryCode);
  const validRows = parsed.rows.filter((r) => r.valid);

  if (validRows.length === 0) {
    return NextResponse.json(
      {
        error:
          "No valid contacts found. Ensure the file has name and phone columns.",
        total: parsed.total,
        invalid: parsed.invalidCount,
      },
      { status: 400 },
    );
  }

  // Deduplicate within the uploaded batch (the DB unique index handles
  // duplicates against existing rows).
  const seen = new Set<string>();
  const toInsert: {
    name: string;
    phone: string;
    token: string;
    source: string;
    created_by: string;
  }[] = [];
  for (const r of validRows) {
    if (seen.has(r.phone)) continue;
    seen.add(r.phone);
    toInsert.push({
      name: r.name,
      phone: r.phone,
      token: generateToken(),
      source: "csv",
      created_by: user.id,
    });
  }

  // ON CONFLICT (phone) DO NOTHING — only brand new contacts are inserted.
  const { data: inserted, error } = await supabase
    .from("contacts")
    .upsert(toInsert, { onConflict: "phone", ignoreDuplicates: true })
    .select("id");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const insertedCount = inserted?.length ?? 0;
  return NextResponse.json({
    inserted: insertedCount,
    skippedExisting: toInsert.length - insertedCount,
    duplicatesInFile: validRows.length - toInsert.length,
    invalid: parsed.invalidCount,
    total: parsed.total,
  });
}
