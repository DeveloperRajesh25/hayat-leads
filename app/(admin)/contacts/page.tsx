import type { Metadata } from "next";
import Link from "next/link";
import { Users, ExternalLink } from "lucide-react";
import { getSessionUser } from "@/lib/auth";
import { PageHeader } from "@/components/admin/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { CsvUploader } from "@/components/contacts/csv-uploader";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { WhatsAppButton } from "@/components/leads/whatsapp-button";
import { formatPhoneDisplay } from "@/lib/phone";
import { formatDateTime } from "@/lib/utils";
import { buildFormUrl } from "@/lib/config";
import type { Contact } from "@/lib/types";

export const metadata: Metadata = { title: "Contacts" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 100;

export default async function ContactsPage() {
  const { supabase } = await getSessionUser();

  const { count } = await supabase
    .from("contacts")
    .select("*", { count: "exact", head: true });

  const { data } = await supabase
    .from("contacts")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(PAGE_SIZE);
  const contacts = (data ?? []) as Contact[];
  const total = count ?? 0;

  return (
    <div>
      <PageHeader
        title="Contacts"
        description="Import your leads from a CSV file. Duplicate phone numbers are skipped automatically."
      />

      <CsvUploader />

      <Card className="mt-8">
        <div className="flex items-center justify-between border-b border-slate-100 p-5">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-slate-900">
              Imported contacts
            </h2>
            <Badge tone="brand">{total.toLocaleString()}</Badge>
          </div>
          {total > PAGE_SIZE && (
            <span className="text-xs text-slate-400">
              Showing latest {PAGE_SIZE}
            </span>
          )}
        </div>
        <CardContent className="p-0">
          {contacts.length === 0 ? (
            <div className="p-5">
              <EmptyState
                icon={<Users className="h-6 w-6" />}
                title="No contacts yet"
                description="Upload a CSV file above to import your first leads."
              />
            </div>
          ) : (
            <Table>
              <THead>
                <TR className="hover:bg-transparent">
                  <TH>Name</TH>
                  <TH>Phone</TH>
                  <TH>Source</TH>
                  <TH>Added</TH>
                  <TH className="text-right">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {contacts.map((c) => (
                  <TR key={c.id}>
                    <TD className="font-medium text-slate-900">{c.name}</TD>
                    <TD>{formatPhoneDisplay(c.phone)}</TD>
                    <TD>
                      <Badge tone="neutral">{c.source ?? "manual"}</Badge>
                    </TD>
                    <TD className="whitespace-nowrap text-slate-500">
                      {formatDateTime(c.created_at)}
                    </TD>
                    <TD>
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          href={buildFormUrl(c.token)}
                          target="_blank"
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          Form
                        </Link>
                        <WhatsAppButton phone={c.phone} name={c.name} label="Chat" />
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
