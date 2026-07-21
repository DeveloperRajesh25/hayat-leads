"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  RotateCw,
  RotateCcw,
  AlertTriangle,
  X,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { runCampaignBatches } from "@/lib/campaign-batch-client";
import { DeliveryBar, type Metrics } from "@/components/campaigns/campaign-metrics";

interface LiveStats extends Metrics {
  status: "draft" | "sending" | "completed" | "failed";
  done: boolean;
}

/**
 * A focused, always-truthful view of one campaign as it sends. Every number is
 * polled live from /status (which counts the messages rows directly), so what
 * you see is exactly what's in the database — no cached or derived guesses.
 *
 * When a send finishes with failures, it retries them ONCE automatically, then
 * leaves the manual "Retry failed" button for anything still failing (those are
 * almost always permanent — invalid numbers, not on WhatsApp, or a per-recipient
 * cap — so hammering them would only hurt the sender's quality rating).
 */
export function CampaignLivePanel({
  campaignId,
  name,
  total,
  autoDrive = false,
  onClose,
}: {
  campaignId: string;
  name?: string;
  total: number;
  autoDrive?: boolean;
  onClose?: () => void;
}) {
  const router = useRouter();
  const [stats, setStats] = useState<LiveStats | null>(null);
  const [driving, setDriving] = useState(autoDrive);
  const [autoRetrying, setAutoRetrying] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const mounted = useRef(true);
  const idlePolls = useRef(0);
  const autoRetryUsed = useRef(false);

  const poll = useCallback(async () => {
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/status`, {
        cache: "no-store",
      });
      if (!res.ok) return null;
      const data = (await res.json()) as LiveStats;
      if (mounted.current) setStats(data);
      return data;
    } catch {
      return null;
    }
  }, [campaignId]);

  // Poll the real numbers: fast while pending, a few slow polls after to catch
  // delivered/read webhooks, then stop.
  useEffect(() => {
    mounted.current = true;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      const data = await poll();
      if (!mounted.current) return;
      const pending = data?.pending ?? 1;
      let delay: number;
      if (pending > 0) {
        idlePolls.current = 0;
        delay = 2500;
      } else {
        idlePolls.current += 1;
        if (idlePolls.current > 20) return; // ~2 min then stop
        delay = 6000;
      }
      timer = setTimeout(tick, delay);
    };
    tick();
    return () => {
      mounted.current = false;
      clearTimeout(timer);
    };
  }, [poll]);

  const retryFailed = useCallback(
    async (auto = false) => {
      // Any retry (manual or auto) disables further automatic retries, so a
      // permanent failure can never loop.
      autoRetryUsed.current = true;
      setActionError(null);
      if (auto) setAutoRetrying(true);
      setDriving(true);
      try {
        const res = await fetch(`/api/campaigns/${campaignId}/retry-failed`, {
          method: "POST",
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setActionError(data?.error ?? "Could not retry failed messages.");
          return;
        }
        await poll();
        if (data.requeued > 0) {
          await runCampaignBatches(campaignId, total, () => void poll());
        }
      } catch (err) {
        setActionError(err instanceof Error ? err.message : "Could not retry.");
      } finally {
        setDriving(false);
        setAutoRetrying(false);
        void poll();
        router.refresh();
      }
    },
    [campaignId, total, poll, router],
  );

  const resume = useCallback(async () => {
    setActionError(null);
    setDriving(true);
    try {
      await runCampaignBatches(campaignId, total, () => void poll());
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not resume.");
    } finally {
      setDriving(false);
      void poll();
      router.refresh();
    }
  }, [campaignId, total, poll, router]);

  // Drive the send loop from the browser right after Send (server also
  // auto-advances — both are safe together).
  useEffect(() => {
    if (!autoDrive) return;
    let cancelled = false;
    (async () => {
      try {
        await runCampaignBatches(campaignId, total, () => {
          if (!cancelled) void poll();
        });
      } catch {
        /* server auto-advance / resume still finish it */
      } finally {
        if (!cancelled && mounted.current) {
          setDriving(false);
          void poll();
          router.refresh();
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId]);

  // Auto-retry ONCE when a run finishes with failures.
  useEffect(() => {
    if (!stats || driving || autoRetryUsed.current) return;
    if (stats.pending === 0 && stats.failed > 0) {
      const t = setTimeout(() => void retryFailed(true), 3500);
      return () => clearTimeout(t);
    }
  }, [stats, driving, retryFailed]);

  const s = stats;
  const totalN = s?.total ?? total;
  const processed = s ? totalN - s.pending : 0;
  const pct = totalN > 0 ? Math.round((processed / totalN) * 100) : 0;
  const busy = driving || (s ? s.pending > 0 : autoDrive);
  const finishedClean = !!s && s.pending === 0 && s.failed === 0;

  const headline = !s
    ? "Starting…"
    : autoRetrying
      ? `Auto-retrying ${s.failed} failed…`
      : busy
        ? `Sending — ${processed} of ${totalN} processed`
        : s.failed > 0
          ? `Finished · ${s.failed} still failing`
          : "All done — every contact sent";

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
        <div className="flex min-w-0 items-center gap-2.5">
          {finishedClean ? (
            <span className="grid h-8 w-8 place-items-center rounded-full bg-emerald-100 dark:bg-emerald-500/15">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            </span>
          ) : (
            <span className="grid h-8 w-8 place-items-center rounded-full bg-brand-100 dark:bg-brand-500/15">
              <Loader2
                className={`h-4 w-4 text-brand-600 dark:text-brand-400 ${busy || autoRetrying ? "animate-spin" : ""}`}
              />
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
              {name ?? "Campaign"}
            </p>
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">
              {headline}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold tabular-nums text-slate-900 dark:text-slate-100">
            {pct}%
          </span>
          {onClose && (
            <button
              onClick={onClose}
              className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <div className="space-y-3 px-4 py-3">
        {s && <DeliveryBar m={s} />}

        {/* Funnel tiles */}
        <div className="grid grid-cols-5 gap-2">
          <Tile label="Accepted" value={s?.accepted} tone="sky" />
          <Tile label="Delivered" value={s?.deliveredTotal} tone="emerald" />
          <Tile label="Read" value={s?.read} tone="violet" />
          <Tile label="Failed" value={s?.failed} tone="red" />
          <Tile label="Pending" value={s?.pending} tone="amber" />
        </div>

        {/* One honest reconciling line */}
        <p className="text-center text-xs text-slate-400 dark:text-slate-500">
          {s
            ? `${s.accepted} accepted + ${s.failed} failed + ${s.pending} pending = ${totalN} contacts`
            : " "}
        </p>

        {!!s && (s.pending > 0 || s.failed > 0) && (
          <div className="flex flex-wrap gap-2 pt-1">
            {s.pending > 0 && (
              <Button size="sm" variant="outline" onClick={resume} loading={busy}>
                <RotateCw className="h-3.5 w-3.5" />
                Resume ({s.pending})
              </Button>
            )}
            {s.failed > 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => retryFailed(false)}
                loading={busy}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Retry failed ({s.failed})
              </Button>
            )}
          </div>
        )}

        {actionError && (
          <p className="flex items-center gap-1 text-xs text-red-600 dark:text-red-400">
            <AlertTriangle className="h-3 w-3" /> {actionError}
          </p>
        )}
      </div>
    </div>
  );
}

function Tile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | undefined;
  tone: "sky" | "emerald" | "violet" | "red" | "amber";
}) {
  const toneClass = {
    sky: "text-sky-600 dark:text-sky-400",
    emerald: "text-emerald-600 dark:text-emerald-400",
    violet: "text-violet-600 dark:text-violet-400",
    red: "text-red-600 dark:text-red-400",
    amber: "text-amber-600 dark:text-amber-400",
  }[tone];
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 px-1 py-2.5 text-center dark:border-slate-800 dark:bg-slate-800/40">
      <div className={`text-xl font-bold tabular-nums ${toneClass}`}>
        {value ?? "—"}
      </div>
      <div className="mt-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {label}
      </div>
    </div>
  );
}
