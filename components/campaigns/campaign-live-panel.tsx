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

export interface LiveStats {
  status: "draft" | "sending" | "completed" | "failed";
  done: boolean;
  total: number;
  pending: number;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  accepted: number;
  deliveredTotal: number;
}

/**
 * A focused, always-truthful view of one campaign as it sends. Every number is
 * polled live from /status (which counts the messages rows directly), so what
 * you see is exactly what's in the database — no cached or derived guesses.
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
  /** Start driving the send loop from the browser on mount (used right after Send). */
  autoDrive?: boolean;
  onClose?: () => void;
}) {
  const router = useRouter();
  const [stats, setStats] = useState<LiveStats | null>(null);
  const [driving, setDriving] = useState(autoDrive);
  const [actionError, setActionError] = useState<string | null>(null);
  const mounted = useRef(true);
  const idlePolls = useRef(0);

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

  // Poll the real numbers. Fast while there's pending work; a few slow polls
  // afterwards to catch delivered/read webhooks; then stop.
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
        // Done sending — keep watching briefly for delivery/read updates.
        idlePolls.current += 1;
        if (idlePolls.current > 20) return; // ~2 min, then stop polling
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

  // Drive the send loop from the browser right after Send. The server also
  // auto-advances, so this is belt-and-suspenders; both are safe together.
  useEffect(() => {
    if (!autoDrive) return;
    let cancelled = false;
    (async () => {
      try {
        await runCampaignBatches(campaignId, total, () => {
          if (!cancelled) void poll();
        });
      } catch {
        // Server auto-advance / resume still finish it.
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

  const resume = async () => {
    setActionError(null);
    setDriving(true);
    try {
      await runCampaignBatches(campaignId, stats?.total ?? total, () => void poll());
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not resume.");
    } finally {
      setDriving(false);
      void poll();
      router.refresh();
    }
  };

  const retryFailed = async () => {
    setActionError(null);
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
        await runCampaignBatches(campaignId, stats?.total ?? total, () => void poll());
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not retry.");
    } finally {
      setDriving(false);
      void poll();
      router.refresh();
    }
  };

  const s = stats;
  const totalN = s?.total ?? total;
  const processed = s ? totalN - s.pending : 0;
  const pct = totalN > 0 ? Math.round((processed / totalN) * 100) : 0;
  const finished = s?.done ?? false;

  const headline = !s
    ? "Loading…"
    : driving || s.pending > 0
      ? `Sending… ${processed} of ${totalN} processed`
      : s.failed > 0
        ? `Finished — ${s.failed} need a retry`
        : "All done — every contact was sent";

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {finished && s?.failed === 0 ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
            ) : (
              <Loader2
                className={`h-4 w-4 shrink-0 text-brand-500 ${driving || (s && s.pending > 0) ? "animate-spin" : ""}`}
              />
            )}
            <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
              {name ?? "Campaign"}
            </p>
          </div>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            {headline}
          </p>
        </div>
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

      {/* Progress bar */}
      <div className="mb-3">
        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
          <div
            className="h-full rounded-full bg-brand-500 transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* The funnel — every number counted live from the messages table. */}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        <Stat label="Accepted" hint="by WhatsApp" value={s?.accepted} tone="sky" />
        <Stat label="Delivered" value={s?.deliveredTotal} tone="indigo" />
        <Stat label="Read" value={s?.read} tone="violet" />
        <Stat label="Failed" value={s?.failed} tone="red" />
        <Stat label="Pending" value={s?.pending} tone="amber" />
      </div>

      <p className="mt-2 text-center text-[11px] text-slate-400 dark:text-slate-500">
        {s
          ? `${s.sent} sent · ${s.delivered} delivered · ${s.read} read · ${s.failed} failed · ${s.pending} pending — of ${totalN}`
          : " "}
      </p>

      {(!!s?.pending || !!s?.failed) && (
        <div className="mt-3 flex flex-wrap gap-2">
          {!!s?.pending && (
            <Button size="sm" variant="outline" onClick={resume} loading={driving}>
              <RotateCw className="h-3.5 w-3.5" />
              Resume sending ({s.pending})
            </Button>
          )}
          {!!s?.failed && (
            <Button
              size="sm"
              variant="outline"
              onClick={retryFailed}
              loading={driving}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Retry failed ({s.failed})
            </Button>
          )}
        </div>
      )}

      {actionError && (
        <p className="mt-2 flex items-center gap-1 text-xs text-red-600 dark:text-red-400">
          <AlertTriangle className="h-3 w-3" /> {actionError}
        </p>
      )}
    </div>
  );
}

function Stat({
  label,
  hint,
  value,
  tone,
}: {
  label: string;
  hint?: string;
  value: number | undefined;
  tone: "sky" | "indigo" | "violet" | "red" | "amber";
}) {
  const toneClass = {
    sky: "text-sky-600 dark:text-sky-400",
    indigo: "text-indigo-600 dark:text-indigo-400",
    violet: "text-violet-600 dark:text-violet-400",
    red: "text-red-600 dark:text-red-400",
    amber: "text-amber-600 dark:text-amber-400",
  }[tone];
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50 px-2 py-2 text-center dark:border-slate-800 dark:bg-slate-800/40">
      <div className={`text-lg font-semibold tabular-nums ${toneClass}`}>
        {value ?? "—"}
      </div>
      <div className="text-[10px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {label}
      </div>
      {hint && (
        <div className="text-[9px] text-slate-400 dark:text-slate-500">{hint}</div>
      )}
    </div>
  );
}
