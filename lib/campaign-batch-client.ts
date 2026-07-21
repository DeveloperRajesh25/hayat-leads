/**
 * Drives a campaign's send-batch endpoint to completion from the browser.
 * Each call sends one bounded page of contacts; this loops until the server
 * reports nothing pending, so the UI can show live progress instead of one
 * long request that risks a serverless timeout (see the send-batch route).
 *
 * This is only ONE of two drivers: the server also self-advances the campaign
 * (see the send route). Running both is safe — each pending recipient is
 * claimed exactly once — so closing the tab never strands a campaign.
 */

export interface CampaignBatchProgress {
  total: number;
  sent: number;
  failed: number;
  /** Recipients not yet sent (queued or waiting out a rate limit). */
  pending: number;
  /** True while the last batch was fully rate-limited (paced back, not failed). */
  throttled: boolean;
  sampleError?: string | null;
  /** Set when the loop stopped with recipients still pending (resumable). */
  paused?: boolean;
}

interface BatchResponse {
  done: boolean;
  totalSent: number;
  totalFailed: number;
  remainingPending: number;
  throttled?: boolean;
  throttledCount?: number;
  sampleError?: string | null;
  error?: string;
}

const MAX_ATTEMPTS = 3;
// If the number is being rate-limited, keep the campaign resumable rather than
// spinning forever in the browser: after this many consecutive fully-throttled
// rounds we stop and report "paused". The server-side auto-advance chain (and
// the manual Resume button) will finish the rest once the limit eases.
const MAX_THROTTLED_ROUNDS = 6;

/** One batch call, retried a few times so a network blip doesn't abort the
 *  whole run — safe to retry because the server only ever acts on rows still
 *  marked "pending". */
async function postBatch(campaignId: string): Promise<BatchResponse> {
  let lastError = "Network error while sending campaign.";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/send-batch`, {
        method: "POST",
      });
      const data = (await res.json().catch(() => ({}))) as BatchResponse;
      if (!res.ok) {
        lastError = data?.error ?? lastError;
      } else {
        return data;
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : lastError;
    }
    if (attempt < MAX_ATTEMPTS) {
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
    }
  }
  throw new Error(lastError);
}

export async function runCampaignBatches(
  campaignId: string,
  total: number,
  onProgress: (progress: CampaignBatchProgress) => void,
): Promise<CampaignBatchProgress> {
  let progress: CampaignBatchProgress = {
    total,
    sent: 0,
    failed: 0,
    pending: total,
    throttled: false,
  };
  let throttledRounds = 0;

  for (;;) {
    const data = await postBatch(campaignId);
    const throttled = Boolean(data.throttled);
    progress = {
      total,
      sent: data.totalSent,
      failed: data.totalFailed,
      pending: data.remainingPending ?? Math.max(0, total - data.totalSent - data.totalFailed),
      throttled,
      sampleError: data.sampleError ?? progress.sampleError,
    };
    onProgress(progress);

    if (data.done) break;

    if (throttled) {
      throttledRounds++;
      if (throttledRounds >= MAX_THROTTLED_ROUNDS) {
        // Hand off to the server-side chain / manual resume so we don't hammer
        // a rate-limited number from the browser. Nothing is lost — the rest
        // stay pending.
        progress = { ...progress, paused: true };
        onProgress(progress);
        break;
      }
      // Back off before the next attempt so we ease off the rate limit.
      await new Promise((resolve) =>
        setTimeout(resolve, Math.min(5000 * throttledRounds, 20000)),
      );
    } else {
      throttledRounds = 0;
    }
  }
  return progress;
}
