"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCw, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { runCampaignBatches } from "@/lib/campaign-batch-client";

/**
 * A campaign left at status "sending" — e.g. the tab was closed mid-run —
 * has its remaining contacts still queued as "pending" messages. This just
 * re-enters the same batch loop the send form uses, so it picks up exactly
 * where the campaign left off instead of needing a new campaign.
 */
export function ResumeCampaignButton({
  campaignId,
  total,
}: {
  campaignId: string;
  total: number;
}) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleResume() {
    setRunning(true);
    setError(null);
    try {
      await runCampaignBatches(campaignId, total, () => router.refresh());
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to resume campaign.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <Button size="sm" variant="outline" onClick={handleResume} loading={running}>
        <RotateCw className="h-3.5 w-3.5" />
        Resume sending
      </Button>
      {error && (
        <span className="flex items-center gap-1 text-xs text-red-600 dark:text-red-400">
          <AlertTriangle className="h-3 w-3" /> {error}
        </span>
      )}
    </div>
  );
}
