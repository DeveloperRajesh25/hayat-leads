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
import { ResumeCampaignButton } from "@/components/campaigns/resume-campaign-button";
import { RetryFailedButton } from "@/components/campaigns/retry-failed-button";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Tooltip } from "@/components/ui/tooltip";
import { formatDateTime } from "@/lib/utils";
import { getCampaignStatsMap } from "@/lib/campaign-stats";
import type { Campaign, Contact } from "@/lib/types";

export const metadata: Metadata = { title: "Campaigns" };
export const dynamic = "force-dynamic";

/**
 * The one place a campaign's headline status is decided — derived from the LIVE
 * message counts, never from a stored column, so the label always agrees with
 * the numbers next to it.
 */
function deriveStatus(
  campaignStatus: string,
  pending: number,
  accepted: number,
  failed: number,
): { label: string; tone: BadgeTone } {
  if (pending > 0) {
    return campaignStatus === "sending"
      ? { label: "sending", tone: "info" }
      : { label: "incomplete", tone: "warning" };
  }
  if (failed > 0 && accepted === 0) return { label: "failed", tone: "danger" };
  if (failed > 0) return { label: "completed", tone: "success" };
  return { label: "completed", tone: "success" };
}

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
  // table (the single source of truth). Everything shown below comes from here
  // — no stored/denormalized counters that could drift.
  const statsByCampaign = await getCampaignStatsMap(campaignIds);

  // Distinct failure reasons per campaign, so the history table can explain
  // why sends failed instead of just showing a count.
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
        description="Send your WhatsApp template to selected contacts and track delivery."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <SendCampaignForm
            contacts={contacts}
            alreadyMessagedIds={alreadyMessagedIds}
            configured={isWhatsappConfigured()}
            templates={templateResult.templates}
            templatesError={templateResult.error ?? null}
            defaultTemplateName={publicConfig.whatsappTemplateName}
          />
        </div>

        <div className="lg:col-span-3">
          <Card>
            <div className="border-b border-slate-100 p-5 dark:border-slate-800">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50">
                Campaign history
              </h2>
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
                <Table>
                  <THead>
                    <TR className="hover:bg-transparent">
                      <TH>Campaign</TH>
                      <TH className="text-center">Contacts</TH>
                      <TH className="text-center">
                        <Tooltip content="Accepted by WhatsApp (sent, delivered or read)">
                          <span className="underline decoration-dotted">
                            Accepted
                          </span>
                        </Tooltip>
                      </TH>
                      <TH className="text-center">
                        <Tooltip content="Confirmed delivered to the handset (delivered or read)">
                          <span className="underline decoration-dotted">
                            Delivered
                          </span>
                        </Tooltip>
                      </TH>
                      <TH className="text-center">Failed</TH>
                      <TH className="text-center">Pending</TH>
                      <TH>Status</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {campaigns.map((c) => {
                      // Every number here is the LIVE count from the messages
                      // table: accepted + failed + pending === contacts, always.
                      const st = statsByCampaign.get(c.id) ?? {
                        total: c.total_contacts,
                        pending: 0,
                        sent: 0,
                        delivered: 0,
                        read: 0,
                        failed: 0,
                        accepted: 0,
                        deliveredTotal: 0,
                      };
                      const status = deriveStatus(
                        c.status,
                        st.pending,
                        st.accepted,
                        st.failed,
                      );
                      const reasons = failureReasonsByCampaign.get(c.id);
                      const badge = (
                        <Badge tone={status.tone}>{status.label}</Badge>
                      );
                      const badgeWithTooltip = reasons?.length ? (
                        <Tooltip
                          content={
                            <ul className="space-y-1">
                              {reasons.map((r, i) => (
                                <li key={i}>{r}</li>
                              ))}
                            </ul>
                          }
                        >
                          {badge}
                        </Tooltip>
                      ) : (
                        badge
                      );
                      return (
                        <TR key={c.id}>
                          <TD>
                            <div className="font-medium text-slate-900 dark:text-slate-100">
                              {c.name}
                            </div>
                            <div className="text-xs text-slate-400 dark:text-slate-500">
                              {formatDateTime(c.sent_at ?? c.created_at)}
                            </div>
                          </TD>
                          <TD className="text-center tabular-nums">
                            {st.total}
                          </TD>
                          <TD className="text-center font-medium tabular-nums text-sky-600 dark:text-sky-400">
                            {st.accepted}
                          </TD>
                          <TD className="text-center font-medium tabular-nums text-indigo-600 dark:text-indigo-400">
                            {st.deliveredTotal}
                          </TD>
                          <TD className="text-center font-medium tabular-nums text-red-600 dark:text-red-400">
                            {st.failed}
                          </TD>
                          <TD className="text-center font-medium tabular-nums text-amber-600 dark:text-amber-400">
                            {st.pending}
                          </TD>
                          <TD>
                            {st.pending > 0 || st.failed > 0 ? (
                              <div className="flex flex-col items-start gap-1.5">
                                {badgeWithTooltip}
                                {st.pending > 0 && (
                                  <ResumeCampaignButton
                                    campaignId={c.id}
                                    total={st.total}
                                  />
                                )}
                                {st.failed > 0 && (
                                  <RetryFailedButton
                                    campaignId={c.id}
                                    failed={st.failed}
                                    total={st.total}
                                  />
                                )}
                              </div>
                            ) : (
                              badgeWithTooltip
                            )}
                          </TD>
                        </TR>
                      );
                    })}
                  </TBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
