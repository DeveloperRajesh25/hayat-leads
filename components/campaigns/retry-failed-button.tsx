"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { runCampaignBatches } from "@/lib/campaign-batch-client";

/**
 * Re-send ONLY the failed recipients of a campaign. Flips their rows back to
 * pending on the server, then re-enters the same batch loop — so people who
 * already received the message are never contacted again.
 */
export function RetryFailedButton({
  campaignId,
  failed,
  total,
}: {
  campaignId: string;
  failed: number;
  total: number;
}) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRetry() {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/retry-failed`, {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? "Could not retry failed messages.");
        return;
      }
      if (data.requeued > 0) {
        await runCampaignBatches(campaignId, data.total, () => router.refresh());
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to retry campaign.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <Button size="sm" variant="outline" onClick={handleRetry} loading={running}>
        <RotateCcw className="h-3.5 w-3.5" />
        Retry failed ({failed})
      </Button>
      {error && (
        <span className="flex items-center gap-1 text-xs text-red-600 dark:text-red-400">
          <AlertTriangle className="h-3 w-3" /> {error}
        </span>
      )}
    </div>
  );
}
