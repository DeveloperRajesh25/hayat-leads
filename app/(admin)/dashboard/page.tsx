import type { Metadata } from "next";
import Link from "next/link";
import {
  Users,
  Send,
  ThumbsUp,
  ThumbsDown,
  Clock,
  MessageSquareText,
  Upload,
  ArrowRight,
  Trophy,
  CheckCheck,
  XCircle,
} from "lucide-react";
import { getSessionUser } from "@/lib/auth";
import { getDashboardStats } from "@/lib/stats";
import { PageHeader } from "@/components/admin/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { InterestBadge } from "@/components/leads/interest-badge";
import { WhatsAppButton } from "@/components/leads/whatsapp-button";
import { ConvertButton } from "@/components/leads/convert-button";
import { formatDateTime } from "@/lib/utils";
import { formatPhoneDisplay } from "@/lib/phone";
import type { LeadResponse } from "@/lib/types";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const { supabase } = await getSessionUser();
  const stats = await getDashboardStats(supabase);

  const { data: recentRaw } = await supabase
    .from("responses")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(5);
  const recent = (recentRaw ?? []) as LeadResponse[];

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Overview of your WhatsApp lead campaigns and customer responses."
      >
        <Link href="/contacts" className={buttonClasses({ variant: "outline" })}>
          <Upload className="h-4 w-4" />
          Import CSV
        </Link>
        <Link href="/campaigns" className={buttonClasses()}>
          <Send className="h-4 w-4" />
          New campaign
        </Link>
      </PageHeader>

      {/* Stat grid — every card links through to the underlying data, can be
          downloaded as CSV via the download icon, and can be individually
          reset to zero via the reset icon (older records stay in the database
          but are no longer counted on that card). */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard
          label="Total contacts"
          value={stats.totalContacts.toLocaleString()}
          icon={<Users className="h-5 w-5" />}
          tone="brand"
          hint="Uploaded from CSV"
          href="/contacts"
          downloadHref="/api/export?type=contacts"
          resetKey="totalContacts"
        />
        <StatCard
          label="Messages sent"
          value={stats.messagesSent.toLocaleString()}
          icon={<Send className="h-5 w-5" />}
          tone="sky"
          hint="Accepted by WhatsApp"
          href="/campaigns"
          downloadHref="/api/export?type=messages"
          resetKey="messagesSent"
        />
        <StatCard
          label="Delivered"
          value={stats.delivered.toLocaleString()}
          icon={<CheckCheck className="h-5 w-5" />}
          tone="emerald"
          hint={
            stats.messagesSent > 0
              ? `${Math.round((stats.delivered / stats.messagesSent) * 100)}% of sent`
              : "Confirmed delivered / read"
          }
          href="/campaigns"
          downloadHref="/api/export?type=delivered"
          resetKey="delivered"
        />
        <StatCard
          label="Failed"
          value={stats.failed.toLocaleString()}
          icon={<XCircle className="h-5 w-5" />}
          tone="red"
          hint="Not delivered — check header image / number"
          href="/campaigns"
          downloadHref="/api/export?type=failed"
          resetKey="failed"
        />
        <StatCard
          label="Pending responses"
          value={stats.pending.toLocaleString()}
          icon={<Clock className="h-5 w-5" />}
          tone="amber"
          hint="Awaiting customer reply"
          href="/contacts"
          downloadHref="/api/export?type=pending"
          resetKey="pending"
        />
        <StatCard
          label="Interested"
          value={stats.interested.toLocaleString()}
          icon={<ThumbsUp className="h-5 w-5" />}
          tone="emerald"
          hint="Ready to follow up"
          href="/leads?status=interested"
          downloadHref="/api/export?type=interested"
          resetKey="interested"
        />
        <StatCard
          label="Converted"
          value={stats.converted.toLocaleString()}
          icon={<Trophy className="h-5 w-5" />}
          tone="violet"
          hint={
            stats.interested > 0
              ? `${Math.round((stats.converted / stats.interested) * 100)}% of interested`
              : "No interested leads yet"
          }
          href="/leads?status=converted"
          downloadHref="/api/export?type=converted"
          resetKey="converted"
        />
        <StatCard
          label="Not interested"
          value={stats.notInterested.toLocaleString()}
          icon={<ThumbsDown className="h-5 w-5" />}
          tone="red"
          href="/leads?status=not_interested"
          downloadHref="/api/export?type=not_interested"
          resetKey="notInterested"
        />
        <StatCard
          label="Total responses"
          value={stats.totalResponses.toLocaleString()}
          icon={<MessageSquareText className="h-5 w-5" />}
          tone="slate"
          hint={`${stats.totalCampaigns} campaign(s) run`}
          href="/leads"
          downloadHref="/api/export?type=responses"
          resetKey="totalResponses"
        />
      </div>

      {/* Recent responses */}
      <Card className="mt-8">
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Recent responses</CardTitle>
          <Link
            href="/leads"
            className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300"
          >
            View all leads <ArrowRight className="h-4 w-4" />
          </Link>
        </CardHeader>
        <CardContent className="p-0">
          {recent.length === 0 ? (
            <div className="p-5">
              <EmptyState
                icon={<MessageSquareText className="h-6 w-6" />}
                title="No responses yet"
                description="Once customers submit the form, their responses appear here."
              />
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {recent.map((r) => (
                <div
                  key={r.id}
                  className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-medium text-slate-900 dark:text-slate-100">
                        {r.name}
                      </p>
                      <InterestBadge status={r.interest_status} />
                      <ConvertButton id={r.id} converted={r.converted} />
                    </div>
                    <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                      {formatPhoneDisplay(r.phone)} · {formatDateTime(r.created_at)}
                    </p>
                    {r.requirement_details && (
                      <p className="mt-1 line-clamp-1 text-sm text-slate-600 dark:text-slate-400">
                        {r.requirement_details}
                      </p>
                    )}
                  </div>
                  <div className="shrink-0">
                    <WhatsAppButton phone={r.phone} name={r.name} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
