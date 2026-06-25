import type { Metadata } from "next";
import Link from "next/link";
import { MessageSquareText, ChevronLeft, ChevronRight } from "lucide-react";
import { getSessionUser } from "@/lib/auth";
import { PageHeader } from "@/components/admin/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { LeadsFilter } from "@/components/leads/leads-filter";
import { InterestBadge } from "@/components/leads/interest-badge";
import { WhatsAppButton } from "@/components/leads/whatsapp-button";
import { formatPhoneDisplay } from "@/lib/phone";
import { formatDateTime } from "@/lib/utils";
import { buttonClasses } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { InterestStatus, LeadResponse } from "@/lib/types";

export const metadata: Metadata = { title: "Leads" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const { supabase } = await getSessionUser();

  const status =
    sp.status === "interested" || sp.status === "not_interested"
      ? (sp.status as InterestStatus)
      : null;
  const q = (sp.q ?? "").trim();
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let query = supabase
    .from("responses")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (status) query = query.eq("interest_status", status);
  if (q) {
    // Strip characters that would break the PostgREST `or` filter syntax.
    const safe = q.replace(/[%,()]/g, " ").trim();
    if (safe) query = query.or(`name.ilike.%${safe}%,phone.ilike.%${safe}%`);
  }

  const { data, count } = await query;
  const leads = (data ?? []) as LeadResponse[];
  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function pageHref(p: number) {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (q) params.set("q", q);
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    return qs ? `/leads?${qs}` : "/leads";
  }

  return (
    <div>
      <PageHeader
        title="Leads"
        description="All customer responses collected from the WhatsApp form."
      >
        <Badge tone="brand">{total.toLocaleString()} total</Badge>
      </PageHeader>

      <Card>
        <div className="border-b border-slate-100 p-4">
          <LeadsFilter />
        </div>
        <CardContent className="p-0">
          {leads.length === 0 ? (
            <div className="p-5">
              <EmptyState
                icon={<MessageSquareText className="h-6 w-6" />}
                title={q || status ? "No matching leads" : "No leads yet"}
                description={
                  q || status
                    ? "Try adjusting your filters."
                    : "Responses appear here once customers submit the form."
                }
              />
            </div>
          ) : (
            <>
              <Table>
                <THead>
                  <TR className="hover:bg-transparent">
                    <TH>Customer</TH>
                    <TH>Interest</TH>
                    <TH>Requirement</TH>
                    <TH>Submitted</TH>
                    <TH className="text-right">Action</TH>
                  </TR>
                </THead>
                <TBody>
                  {leads.map((lead) => (
                    <TR key={lead.id} className="align-top">
                      <TD>
                        <div className="font-medium text-slate-900">
                          {lead.name}
                        </div>
                        <div className="text-xs text-slate-500">
                          {formatPhoneDisplay(lead.phone)}
                        </div>
                      </TD>
                      <TD>
                        <InterestBadge status={lead.interest_status} />
                      </TD>
                      <TD className="max-w-xs">
                        {lead.requirement_details ? (
                          <p
                            className="line-clamp-2 text-slate-700"
                            title={lead.requirement_details}
                          >
                            {lead.requirement_details}
                          </p>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                        {lead.notes && (
                          <p
                            className="mt-1 line-clamp-1 text-xs text-slate-400"
                            title={lead.notes}
                          >
                            Note: {lead.notes}
                          </p>
                        )}
                      </TD>
                      <TD className="whitespace-nowrap text-slate-500">
                        {formatDateTime(lead.created_at)}
                      </TD>
                      <TD>
                        <div className="flex justify-end">
                          <WhatsAppButton phone={lead.phone} name={lead.name} />
                        </div>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>

              {totalPages > 1 && (
                <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-sm">
                  <span className="text-slate-500">
                    Page {page} of {totalPages}
                  </span>
                  <div className="flex items-center gap-2">
                    <Link
                      href={pageHref(page - 1)}
                      aria-disabled={page <= 1}
                      className={cn(
                        buttonClasses({ variant: "outline", size: "sm" }),
                        page <= 1 && "pointer-events-none opacity-40",
                      )}
                    >
                      <ChevronLeft className="h-4 w-4" /> Prev
                    </Link>
                    <Link
                      href={pageHref(page + 1)}
                      aria-disabled={page >= totalPages}
                      className={cn(
                        buttonClasses({ variant: "outline", size: "sm" }),
                        page >= totalPages && "pointer-events-none opacity-40",
                      )}
                    >
                      Next <ChevronRight className="h-4 w-4" />
                    </Link>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
