import type { Metadata } from "next";
import { Users } from "lucide-react";
import { getSessionUser } from "@/lib/auth";
import { PageHeader } from "@/components/admin/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { CsvUploader } from "@/components/contacts/csv-uploader";
import { AddContactForm } from "@/components/contacts/add-contact-form";
import { ContactActions } from "@/components/contacts/contact-actions";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { formatPhoneDisplay } from "@/lib/phone";
import { formatDateTime } from "@/lib/utils";
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

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <CsvUploader />
        <AddContactForm />
      </div>

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
                      <ContactActions
                        id={c.id}
                        name={c.name}
                        phone={c.phone}
                        token={c.token}
                      />
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
