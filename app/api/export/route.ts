import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { toCsv } from "@/lib/csv";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const EXPORT_TYPES = [
  "contacts",
  "messages",
  "delivered",
  "failed",
  "pending",
  "interested",
  "not_interested",
  "converted",
  "responses",
] as const;

type ExportType = (typeof EXPORT_TYPES)[number];

function isExportType(value: string | null): value is ExportType {
  return !!value && (EXPORT_TYPES as readonly string[]).includes(value);
}

/**
 * CSV export for the dashboard's per-stat download buttons. Returns a plain
 * text/csv attachment — no JSON — so a plain `<a href download>` works.
 */
export async function GET(req: Request) {
  const { supabase, user } = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const type = new URL(req.url).searchParams.get("type");
  if (!isExportType(type)) {
    return NextResponse.json({ error: "Invalid export type." }, { status: 400 });
  }

  let filename = `${type}.csv`;
  let csv: string;

  switch (type) {
    case "contacts": {
      const { data, error } = await supabase
        .from("contacts")
        .select("name, phone, source, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      csv = toCsv(
        ["Name", "Phone", "Source", "Added"],
        (data ?? []).map((c) => [
          c.name,
          `+${c.phone}`,
          c.source ?? "manual",
          formatDateTime(c.created_at),
        ]),
      );
      filename = "contacts.csv";
      break;
    }

    case "messages": {
      const { data, error } = await supabase
        .from("messages")
        .select("phone, status, created_at, contact:contacts(name)")
        .in("status", ["sent", "delivered", "read"])
        .order("created_at", { ascending: false });
      if (error) throw error;
      type Row = {
        phone: string;
        status: string;
        created_at: string;
        contact: { name: string } | { name: string }[] | null;
      };
      csv = toCsv(
        ["Name", "Phone", "Status", "Sent"],
        ((data ?? []) as Row[]).map((m) => {
          const contact = Array.isArray(m.contact) ? m.contact[0] : m.contact;
          return [
            contact?.name ?? "—",
            `+${m.phone}`,
            m.status,
            formatDateTime(m.created_at),
          ];
        }),
      );
      filename = "messages-sent.csv";
      break;
    }

    case "delivered": {
      const { data, error } = await supabase
        .from("messages")
        .select("phone, status, created_at, contact:contacts(name)")
        .in("status", ["delivered", "read"])
        .order("created_at", { ascending: false });
      if (error) throw error;
      type Row = {
        phone: string;
        status: string;
        created_at: string;
        contact: { name: string } | { name: string }[] | null;
      };
      csv = toCsv(
        ["Name", "Phone", "Status", "Sent"],
        ((data ?? []) as Row[]).map((m) => {
          const contact = Array.isArray(m.contact) ? m.contact[0] : m.contact;
          return [
            contact?.name ?? "—",
            `+${m.phone}`,
            m.status,
            formatDateTime(m.created_at),
          ];
        }),
      );
      filename = "delivered-messages.csv";
      break;
    }

    case "failed": {
      const { data, error } = await supabase
        .from("messages")
        .select("phone, error, created_at, contact:contacts(name)")
        .eq("status", "failed")
        .order("created_at", { ascending: false });
      if (error) throw error;
      type Row = {
        phone: string;
        error: string | null;
        created_at: string;
        contact: { name: string } | { name: string }[] | null;
      };
      csv = toCsv(
        ["Name", "Phone", "Error", "Sent"],
        ((data ?? []) as Row[]).map((m) => {
          const contact = Array.isArray(m.contact) ? m.contact[0] : m.contact;
          return [
            contact?.name ?? "—",
            `+${m.phone}`,
            m.error ?? "",
            formatDateTime(m.created_at),
          ];
        }),
      );
      filename = "failed-messages.csv";
      break;
    }

    case "pending": {
      const [{ data: contacts, error: contactsError }, { data: responses, error: responsesError }] =
        await Promise.all([
          supabase.from("contacts").select("name, phone, created_at"),
          supabase.from("responses").select("phone"),
        ]);
      if (contactsError) throw contactsError;
      if (responsesError) throw responsesError;
      const responded = new Set((responses ?? []).map((r) => r.phone));
      const pendingRows = (contacts ?? []).filter((c) => !responded.has(c.phone));
      csv = toCsv(
        ["Name", "Phone", "Added"],
        pendingRows.map((c) => [c.name, `+${c.phone}`, formatDateTime(c.created_at)]),
      );
      filename = "pending-responses.csv";
      break;
    }

    case "interested":
    case "not_interested": {
      const { data, error } = await supabase
        .from("responses")
        .select("name, phone, requirement_details, converted, created_at")
        .eq("interest_status", type)
        .order("created_at", { ascending: false });
      if (error) throw error;
      csv = toCsv(
        ["Name", "Phone", "Requirement", "Converted", "Submitted"],
        (data ?? []).map((r) => [
          r.name,
          `+${r.phone}`,
          r.requirement_details ?? "",
          r.converted ? "Yes" : "No",
          formatDateTime(r.created_at),
        ]),
      );
      filename = `${type.replace("_", "-")}-leads.csv`;
      break;
    }

    case "converted": {
      const { data, error } = await supabase
        .from("responses")
        .select("name, phone, requirement_details, converted_at")
        .eq("converted", true)
        .order("converted_at", { ascending: false });
      if (error) throw error;
      csv = toCsv(
        ["Name", "Phone", "Requirement", "Converted at"],
        (data ?? []).map((r) => [
          r.name,
          `+${r.phone}`,
          r.requirement_details ?? "",
          formatDateTime(r.converted_at),
        ]),
      );
      filename = "converted-leads.csv";
      break;
    }

    case "responses": {
      const { data, error } = await supabase
        .from("responses")
        .select("name, phone, interest_status, requirement_details, converted, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      csv = toCsv(
        ["Name", "Phone", "Interest", "Requirement", "Converted", "Submitted"],
        (data ?? []).map((r) => [
          r.name,
          `+${r.phone}`,
          r.interest_status,
          r.requirement_details ?? "",
          r.converted ? "Yes" : "No",
          formatDateTime(r.created_at),
        ]),
      );
      filename = "all-responses.csv";
      break;
    }
  }

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
