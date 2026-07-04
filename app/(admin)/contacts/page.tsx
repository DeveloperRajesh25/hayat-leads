import type { Metadata } from "next";
import { getSessionUser } from "@/lib/auth";
import { PageHeader } from "@/components/admin/page-header";
import { Card } from "@/components/ui/card";
import { CsvUploader } from "@/components/contacts/csv-uploader";
import { AddContactForm } from "@/components/contacts/add-contact-form";
import { ContactsTable } from "@/components/contacts/contacts-table";
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
        <ContactsTable contacts={contacts} total={total} pageSize={PAGE_SIZE} />
      </Card>
    </div>
  );
}
