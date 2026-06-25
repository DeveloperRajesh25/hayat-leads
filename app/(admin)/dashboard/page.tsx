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

      {/* Stat grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard
          label="Total contacts"
          value={stats.totalContacts.toLocaleString()}
          icon={<Users className="h-5 w-5" />}
          tone="brand"
          hint="Uploaded from CSV"
        />
        <StatCard
          label="Messages sent"
          value={stats.messagesSent.toLocaleString()}
          icon={<Send className="h-5 w-5" />}
          tone="sky"
          hint="Delivered via WhatsApp"
        />
        <StatCard
          label="Pending responses"
          value={stats.pending.toLocaleString()}
          icon={<Clock className="h-5 w-5" />}
          tone="amber"
          hint="Awaiting customer reply"
        />
        <StatCard
          label="Interested"
          value={stats.interested.toLocaleString()}
          icon={<ThumbsUp className="h-5 w-5" />}
          tone="emerald"
          hint="Ready to follow up"
        />
        <StatCard
          label="Not interested"
          value={stats.notInterested.toLocaleString()}
          icon={<ThumbsDown className="h-5 w-5" />}
          tone="red"
        />
        <StatCard
          label="Total responses"
          value={stats.totalResponses.toLocaleString()}
          icon={<MessageSquareText className="h-5 w-5" />}
          tone="slate"
          hint={`${stats.totalCampaigns} campaign(s) run`}
        />
      </div>

      {/* Recent responses */}
      <Card className="mt-8">
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Recent responses</CardTitle>
          <Link
            href="/leads"
            className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700"
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
            <div className="divide-y divide-slate-100">
              {recent.map((r) => (
                <div
                  key={r.id}
                  className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-medium text-slate-900">
                        {r.name}
                      </p>
                      <InterestBadge status={r.interest_status} />
                    </div>
                    <p className="mt-0.5 text-sm text-slate-500">
                      {formatPhoneDisplay(r.phone)} · {formatDateTime(r.created_at)}
                    </p>
                    {r.requirement_details && (
                      <p className="mt-1 line-clamp-1 text-sm text-slate-600">
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
