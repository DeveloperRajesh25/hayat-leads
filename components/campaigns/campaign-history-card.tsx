"use client";

import { Badge } from "@/components/ui/badge";
import { Tooltip } from "@/components/ui/tooltip";
import { formatDateTime } from "@/lib/utils";
import { ResumeCampaignButton } from "@/components/campaigns/resume-campaign-button";
import { RetryFailedButton } from "@/components/campaigns/retry-failed-button";
import {
  DeliveryBar,
  StatChips,
  deriveDisplayStatus,
  type Metrics,
} from "@/components/campaigns/campaign-metrics";

/**
 * One campaign in the history: name + when, a status pill, the segmented
 * delivery bar, all six live metrics, and (only when relevant) resume/retry.
 * Every number comes from the campaign_stats view — the single source of truth.
 */
export function CampaignHistoryCard({
  campaignId,
  name,
  dateISO,
  campaignStatus,
  metrics,
  failureReasons,
}: {
  campaignId: string;
  name: string;
  dateISO: string;
  campaignStatus: string;
  metrics: Metrics;
  failureReasons: string[];
}) {
  const status = deriveDisplayStatus(campaignStatus, metrics);
  const badge = <Badge tone={status.tone}>{status.label}</Badge>;

  return (
    <div className="px-5 py-4 transition-colors hover:bg-slate-50/60 dark:hover:bg-slate-800/30">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium text-slate-900 dark:text-slate-100">
            {name}
          </p>
          <p className="text-xs text-slate-400 dark:text-slate-500">
            {formatDateTime(dateISO)}
          </p>
        </div>
        {failureReasons.length ? (
          <Tooltip
            content={
              <ul className="space-y-1">
                {failureReasons.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            }
          >
            {badge}
          </Tooltip>
        ) : (
          badge
        )}
      </div>

      <DeliveryBar m={metrics} />

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <StatChips m={metrics} />
        {(metrics.pending > 0 || metrics.failed > 0) && (
          <div className="flex flex-wrap gap-2">
            {metrics.pending > 0 && (
              <ResumeCampaignButton campaignId={campaignId} total={metrics.total} />
            )}
            {metrics.failed > 0 && (
              <RetryFailedButton
                campaignId={campaignId}
                failed={metrics.failed}
                total={metrics.total}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
