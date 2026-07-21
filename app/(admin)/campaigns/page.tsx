import type { Metadata } from "next";
import { Send } from "lucide-react";
import { getSessionUser } from "@/lib/auth";
import {
  isWhatsappConfigured,
  isWhatsappTemplateListingConfigured,
  publicConfig,
} from "@/lib/config";
import { fetchApprovedTemplates } from "@/lib/whatsapp";
import { PageHeader } from "@/components/admin/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { SendCampaignForm } from "@/components/campaigns/send-campaign-form";
import { CampaignHistoryCard } from "@/components/campaigns/campaign-history-card";
import { EmptyState } from "@/components/ui/empty-state";
import { getCampaignStatsMap } from "@/lib/campaign-stats";
import type { Campaign, Contact } from "@/lib/types";

export const metadata: Metadata = { title: "Campaigns" };
export const dynamic = "force-dynamic";

export default async function CampaignsPage() {
  const { supabase } = await getSessionUser();

  // Approved templates on the WABA — the campaign form lets you pick any of
  // them, so this list is read live rather than pinned to one env var.
  const templateResult = isWhatsappTemplateListingConfigured()
    ? await fetchApprovedTemplates()
    : {
        ok: false,
        templates: [],
        error:
          "Set WHATSAPP_BUSINESS_ACCOUNT_ID in your environment to list your WhatsApp templates.",
      };

  const { data: contactsData } = await supabase
    .from("contacts")
    .select("id, name, phone")
    .order("created_at", { ascending: false });
  const contacts = (contactsData ?? []) as Pick<
    Contact,
    "id" | "name" | "phone"
  >[];

  // Contacts who already received a successful message in a previous
  // campaign — unselected by default when composing a new one.
  const { data: sentMessages } = await supabase
    .from("messages")
    .select("contact_id")
    .in("status", ["sent", "delivered", "read"]);
  const alreadyMessagedIds = Array.from(
    new Set(
      (sentMessages ?? [])
        .map((m) => m.contact_id)
        .filter((id): id is string => !!id),
    ),
  );

  const { data } = await supabase
    .from("campaigns")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(30);
  const campaigns = (data ?? []) as Campaign[];
  const campaignIds = campaigns.map((c) => c.id);

  // LIVE delivery breakdown per campaign, counted straight from the messages
  // table (single source of truth). Everything below reads from here.
  const statsByCampaign = await getCampaignStatsMap(campaignIds);

  // Distinct failure reasons per campaign, so a campaign can explain WHY it
  // failed rather than just showing a count.
  const { data: failedMessages } = campaignIds.length
    ? await supabase
        .from("messages")
        .select("campaign_id, error")
        .eq("status", "failed")
        .in("campaign_id", campaignIds)
    : { data: [] };
  const failureReasonsByCampaign = new Map<string, string[]>();
  for (const m of failedMessages ?? []) {
    if (!m.campaign_id || !m.error) continue;
    const existing = failureReasonsByCampaign.get(m.campaign_id) ?? [];
    if (!existing.includes(m.error)) existing.push(m.error);
    failureReasonsByCampaign.set(m.campaign_id, existing);
  }

  return (
    <div>
      <PageHeader
        title="Campaigns"
        description="Send your WhatsApp template to selected contacts and track every delivery live."
      />

      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-12">
        <div className="xl:col-span-5">
          <SendCampaignForm
            contacts={contacts}
            alreadyMessagedIds={alreadyMessagedIds}
            configured={isWhatsappConfigured()}
            templates={templateResult.templates}
            templatesError={templateResult.error ?? null}
            defaultTemplateName={publicConfig.whatsappTemplateName}
          />
        </div>

        <div className="xl:col-span-7">
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50">
                  Campaign history
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Accepted, delivered, read, failed and pending — counted live.
                </p>
              </div>
              {campaigns.length > 0 && (
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  {campaigns.length} shown
                </span>
              )}
            </div>
            <CardContent className="p-0">
              {campaigns.length === 0 ? (
                <div className="p-5">
                  <EmptyState
                    icon={<Send className="h-6 w-6" />}
                    title="No campaigns yet"
                    description="Send your first campaign to start collecting responses."
                  />
                </div>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {campaigns.map((c) => {
                    const m = statsByCampaign.get(c.id) ?? {
                      total: c.total_contacts,
                      pending: 0,
                      sent: 0,
                      delivered: 0,
                      read: 0,
                      failed: 0,
                      accepted: 0,
                      deliveredTotal: 0,
                    };
                    return (
                      <CampaignHistoryCard
                        key={c.id}
                        campaignId={c.id}
                        name={c.name}
                        dateISO={c.sent_at ?? c.created_at}
                        campaignStatus={c.status}
                        metrics={m}
                        failureReasons={failureReasonsByCampaign.get(c.id) ?? []}
                      />
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
