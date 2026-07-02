import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { createContactSchema } from "@/lib/validation";
import { normalizePhone } from "@/lib/phone";
import { generateToken } from "@/lib/utils";
import { publicConfig } from "@/lib/config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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

  const parsed = createContactSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input." },
      { status: 400 },
    );
  }

  const phone = normalizePhone(parsed.data.phone, publicConfig.defaultCountryCode);
  if (!phone) {
    return NextResponse.json(
      { error: "Please enter a valid phone number." },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from("contacts")
    .insert({
      name: parsed.data.name,
      phone,
      token: generateToken(),
      source: "manual",
      created_by: user.id,
    })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "A contact with this phone number already exists." },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ contact: data });
}
