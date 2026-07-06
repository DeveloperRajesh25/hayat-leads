"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, MessageSquareText, X } from "lucide-react";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { InterestBadge } from "@/components/leads/interest-badge";
import { ConvertButton } from "@/components/leads/convert-button";
import { LeadActions } from "@/components/leads/lead-actions";
import { formatPhoneDisplay } from "@/lib/phone";
import { formatDateTime, cn } from "@/lib/utils";
import type { LeadResponse } from "@/lib/types";

const CHECKBOX_CLASSES =
  "h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500/30 dark:border-slate-600 dark:bg-slate-800";

export function LeadsTable({
  leads,
  emptyTitle,
  emptyDescription,
}: {
  leads: LeadResponse[];
  emptyTitle: string;
  emptyDescription: string;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allSelected = leads.length > 0 && selected.size === leads.length;
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
    setSelected(allSelected ? new Set() : new Set(leads.map((l) => l.id)));
  }

  async function handleBulkDelete() {
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch("/api/leads", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selected) }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "Could not delete selected leads.");
        return;
      }
      setSelected(new Set());
      setConfirming(false);
      router.refresh();
    } catch {
      setError("Network error while deleting leads.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div>
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4 dark:border-slate-800">
          {confirming ? (
            <div className="flex flex-wrap items-center gap-2">
              {error && (
                <span className="text-xs text-red-600 dark:text-red-400">{error}</span>
              )}
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Delete {selected.size} lead{selected.size === 1 ? "" : "s"}?
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
              <Button variant="outline" size="sm" onClick={() => setSelected(new Set())}>
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
          )}
        </div>
      )}

      {leads.length === 0 ? (
        <div className="p-5">
          <EmptyState
            icon={<MessageSquareText className="h-6 w-6" />}
            title={emptyTitle}
            description={emptyDescription}
          />
        </div>
      ) : (
        <Table>
          <THead>
            <TR className="hover:bg-transparent">
              <TH className="w-10">
                <input
                  type="checkbox"
                  aria-label="Select all leads"
                  checked={allSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someSelected;
                  }}
                  onChange={toggleAll}
                  className={CHECKBOX_CLASSES}
                />
              </TH>
              <TH>Customer</TH>
              <TH>Interest</TH>
              <TH>Requirement</TH>
              <TH>Submitted</TH>
              <TH>Converted</TH>
              <TH className="text-right">Action</TH>
            </TR>
          </THead>
          <TBody>
            {leads.map((lead) => (
              <TR
                key={lead.id}
                className={cn(
                  "align-top",
                  selected.has(lead.id) && "bg-brand-50/40 dark:bg-brand-500/5",
                )}
              >
                <TD>
                  <input
                    type="checkbox"
                    aria-label={`Select ${lead.name}`}
                    checked={selected.has(lead.id)}
                    onChange={() => toggleOne(lead.id)}
                    className={CHECKBOX_CLASSES}
                  />
                </TD>
                <TD>
                  <div className="font-medium text-slate-900 dark:text-slate-100">
                    {lead.name}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {formatPhoneDisplay(lead.phone)}
                  </div>
                </TD>
                <TD>
                  <InterestBadge status={lead.interest_status} />
                </TD>
                <TD className="max-w-xs">
                  {lead.requirement_details ? (
                    <p
                      className="line-clamp-2 text-slate-700 dark:text-slate-300"
                      title={lead.requirement_details}
                    >
                      {lead.requirement_details}
                    </p>
                  ) : (
                    <span className="text-slate-400 dark:text-slate-500">—</span>
                  )}
                  {lead.notes && (
                    <p
                      className="mt-1 line-clamp-1 text-xs text-slate-400 dark:text-slate-500"
                      title={lead.notes}
                    >
                      Note: {lead.notes}
                    </p>
                  )}
                </TD>
                <TD className="whitespace-nowrap text-slate-500 dark:text-slate-400">
                  {formatDateTime(lead.created_at)}
                </TD>
                <TD>
                  <ConvertButton id={lead.id} converted={lead.converted} />
                </TD>
                <TD>
                  <LeadActions id={lead.id} name={lead.name} phone={lead.phone} />
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
}
