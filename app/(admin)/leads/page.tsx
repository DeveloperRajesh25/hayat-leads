import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getSessionUser } from "@/lib/auth";
import { PageHeader } from "@/components/admin/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LeadsFilter } from "@/components/leads/leads-filter";
import { LeadsTable } from "@/components/leads/leads-table";
import { buttonClasses } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { LeadResponse } from "@/lib/types";

export const metadata: Metadata = { title: "Leads" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

type StatusFilter = "interested" | "not_interested" | "converted";

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const { supabase } = await getSessionUser();

  const status: StatusFilter | null =
    sp.status === "interested" ||
    sp.status === "not_interested" ||
    sp.status === "converted"
      ? (sp.status as StatusFilter)
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

  if (status === "converted") query = query.eq("converted", true);
  else if (status) query = query.eq("interest_status", status);
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
        <div className="border-b border-slate-100 p-4 dark:border-slate-800">
          <LeadsFilter />
        </div>
        <CardContent className="p-0">
          <LeadsTable
            leads={leads}
            emptyTitle={q || status ? "No matching leads" : "No leads yet"}
            emptyDescription={
              q || status
                ? "Try adjusting your filters."
                : "Responses appear here once customers submit the form."
            }
          />

          {leads.length > 0 && (
            <>
              {totalPages > 1 && (
                <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-sm dark:border-slate-800">
                  <span className="text-slate-500 dark:text-slate-400">
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
