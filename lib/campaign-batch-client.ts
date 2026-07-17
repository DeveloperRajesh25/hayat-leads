/**
 * Drives a campaign's send-batch endpoint to completion from the browser.
 * Each call sends one bounded page of contacts; this loops until the server
 * reports nothing pending, so the UI can show live progress instead of one
 * long request that risks a serverless timeout (see the send-batch route).
 */

export interface CampaignBatchProgress {
  total: number;
  sent: number;
  failed: number;
  sampleError?: string | null;
}

interface BatchResponse {
  done: boolean;
  totalSent: number;
  totalFailed: number;
  sampleError?: string | null;
  error?: string;
}

const MAX_ATTEMPTS = 3;

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
  let progress: CampaignBatchProgress = { total, sent: 0, failed: 0 };
  for (;;) {
    const data = await postBatch(campaignId);
    progress = {
      total,
      sent: data.totalSent,
      failed: data.totalFailed,
      sampleError: data.sampleError ?? progress.sampleError,
    };
    onProgress(progress);
    if (data.done) break;
  }
  return progress;
}
