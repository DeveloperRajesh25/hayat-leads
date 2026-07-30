import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { bulkDeleteLeadsSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Bulk delete — used by the "select multiple" leads table. */
export async function DELETE(req: Request) {
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

  const parsed = bulkDeleteLeadsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input." },
      { status: 400 },
    );
  }

  // Chunked: `.in()` filters are sent as query-string params, and a large
  // selection can exceed the API gateway's URL length limit ("Bad Request").
  const DELETE_CHUNK = 150;
  for (let i = 0; i < parsed.data.ids.length; i += DELETE_CHUNK) {
    const idsChunk = parsed.data.ids.slice(i, i + DELETE_CHUNK);
    const { error } = await supabase.from("responses").delete().in("id", idsChunk);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, deleted: parsed.data.ids.length });
}
