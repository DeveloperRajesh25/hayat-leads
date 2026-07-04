"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Users, X } from "lucide-react";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ContactActions } from "@/components/contacts/contact-actions";
import { formatPhoneDisplay } from "@/lib/phone";
import { formatDateTime, cn } from "@/lib/utils";
import type { Contact } from "@/lib/types";

const CHECKBOX_CLASSES =
  "h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500/30 dark:border-slate-600 dark:bg-slate-800";

export function ContactsTable({
  contacts,
  total,
  pageSize,
}: {
  contacts: Contact[];
  total: number;
  pageSize: number;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allSelected = contacts.length > 0 && selected.size === contacts.length;
  const someSelected = selected.size > 0 && !allSelected;

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(contacts.map((c) => c.id)));
  }

  async function handleBulkDelete() {
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch("/api/contacts", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selected) }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "Could not delete selected contacts.");
        return;
      }
      setSelected(new Set());
      setConfirming(false);
      router.refresh();
    } catch {
      setError("Network error while deleting contacts.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-5 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50">
            Imported contacts
          </h2>
          <Badge tone="brand">{total.toLocaleString()}</Badge>
        </div>

        {selected.size > 0 ? (
          confirming ? (
            <div className="flex flex-wrap items-center gap-2">
              {error && (
                <span className="text-xs text-red-600 dark:text-red-400">{error}</span>
              )}
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Delete {selected.size} contact{selected.size === 1 ? "" : "s"}?
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setConfirming(false)}
                disabled={deleting}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={handleBulkDelete}
                loading={deleting}
              >
                Confirm
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                {selected.size} selected
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelected(new Set())}
              >
                <X className="h-3.5 w-3.5" />
                Clear
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={() => {
                  setError(null);
                  setConfirming(true);
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete selected
              </Button>
            </div>
          )
        ) : (
          total > pageSize && (
            <span className="text-xs text-slate-400 dark:text-slate-500">
              Showing latest {pageSize}
            </span>
          )
        )}
      </div>

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
              <TH className="w-10">
                <input
                  type="checkbox"
                  aria-label="Select all contacts"
                  checked={allSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someSelected;
                  }}
                  onChange={toggleAll}
                  className={CHECKBOX_CLASSES}
                />
              </TH>
              <TH>Name</TH>
              <TH>Phone</TH>
              <TH>Source</TH>
              <TH>Added</TH>
              <TH className="text-right">Actions</TH>
            </TR>
          </THead>
          <TBody>
            {contacts.map((c) => (
              <TR
                key={c.id}
                className={cn(
                  selected.has(c.id) && "bg-brand-50/40 dark:bg-brand-500/5",
                )}
              >
                <TD>
                  <input
                    type="checkbox"
                    aria-label={`Select ${c.name}`}
                    checked={selected.has(c.id)}
                    onChange={() => toggleOne(c.id)}
                    className={CHECKBOX_CLASSES}
                  />
                </TD>
                <TD className="font-medium text-slate-900 dark:text-slate-100">
                  {c.name}
                </TD>
                <TD>{formatPhoneDisplay(c.phone)}</TD>
                <TD>
                  <Badge tone="neutral">{c.source ?? "manual"}</Badge>
                </TD>
                <TD className="whitespace-nowrap text-slate-500 dark:text-slate-400">
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
    </div>
  );
}
