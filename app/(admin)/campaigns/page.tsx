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
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Tooltip } from "@/components/ui/tooltip";
import { formatDateTime } from "@/lib/utils";
import type { Campaign, CampaignStatus, Contact } from "@/lib/types";

export const metadata: Metadata = { title: "Campaigns" };
export const dynamic = "force-dynamic";

const STATUS_TONE: Record<CampaignStatus, BadgeTone> = {
  draft: "neutral",
  sending: "info",
  completed: "success",
  failed: "danger",
};

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
    .limit(50);
  const campaigns = (data ?? []) as Campaign[];

  // Distinct failure reasons per campaign, so the history table can explain
  // why sends failed instead of just showing a count.
  const campaignIds = campaigns.map((c) => c.id);
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
                      <TH className="text-center">Sent</TH>
                      <TH className="text-center">Failed</TH>
                      <TH>Status</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {campaigns.map((c) => (
                      <TR key={c.id}>
                        <TD>
                          <div className="font-medium text-slate-900 dark:text-slate-100">
                            {c.name}
                          </div>
                          <div className="text-xs text-slate-400 dark:text-slate-500">
                            {formatDateTime(c.sent_at ?? c.created_at)}
                          </div>
                        </TD>
                        <TD className="text-center">{c.total_contacts}</TD>
                        <TD className="text-center font-medium text-emerald-600 dark:text-emerald-400">
                          {c.messages_sent}
                        </TD>
                        <TD className="text-center font-medium text-red-600 dark:text-red-400">
                          {c.messages_failed}
                        </TD>
                        <TD>
                          {(() => {
                            const reasons = failureReasonsByCampaign.get(c.id);
                            const badge = (
                              <Badge tone={STATUS_TONE[c.status] ?? "neutral"}>
                                {c.status}
                              </Badge>
                            );
                            if (!reasons?.length) return badge;
                            return (
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
                            );
                          })()}
                        </TD>
                      </TR>
                    ))}
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
