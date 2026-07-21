import { Tooltip } from "@/components/ui/tooltip";
import type { BadgeTone } from "@/components/ui/badge";

/**
 * One consistent delivery model shared by the live panel and the history, so
 * the same campaign never shows two different-looking sets of numbers.
 *
 * The funnel is cumulative, exactly like WhatsApp's own ticks:
 *   accepted (169)  ⊇  delivered (154)  ⊇  read (9)
 * and the only numbers that partition the whole list are:
 *   accepted + failed + pending === total
 * `sent` is just "accepted but not yet delivered" (a single grey tick).
 */
export interface Metrics {
  total: number;
  pending: number;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  accepted: number; // sent + delivered + read
  deliveredTotal: number; // delivered + read
}

export function deriveDisplayStatus(
  campaignStatus: string,
  m: Metrics,
): { label: string; tone: BadgeTone } {
  if (m.pending > 0) {
    return campaignStatus === "sending"
      ? { label: "Sending", tone: "info" }
      : { label: "Incomplete", tone: "warning" };
  }
  if (m.failed > 0 && m.accepted === 0) return { label: "Failed", tone: "danger" };
  if (m.failed > 0) return { label: "Completed", tone: "success" };
  return { label: "Completed", tone: "success" };
}

const COLORS = {
  delivered: "bg-emerald-500",
  sent: "bg-sky-500",
  failed: "bg-red-500",
  pending: "bg-amber-400",
} as const;

/**
 * A single segmented bar that partitions all contacts: delivered (green),
 * accepted-not-yet-delivered (blue), failed (red), pending (amber). Segments
 * always sum to the full width, so the bar itself is the reconciliation.
 */
export function DeliveryBar({ m }: { m: Metrics }) {
  const total = Math.max(m.total, 1);
  const acceptedNotDelivered = Math.max(0, m.accepted - m.deliveredTotal);
  const pct = (n: number) => `${(n / total) * 100}%`;
  const seg = [
    { key: "delivered", w: m.deliveredTotal, cls: COLORS.delivered },
    { key: "sent", w: acceptedNotDelivered, cls: COLORS.sent },
    { key: "failed", w: m.failed, cls: COLORS.failed },
    { key: "pending", w: m.pending, cls: COLORS.pending },
  ];
  return (
    <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
      {seg.map((s) =>
        s.w > 0 ? (
          <div
            key={s.key}
            className={`${s.cls} h-full transition-all duration-500`}
            style={{ width: pct(s.w) }}
          />
        ) : null,
      )}
    </div>
  );
}

interface ChipDef {
  label: string;
  value: number;
  dot: string;
  text: string;
  tip?: React.ReactNode;
}

function chips(m: Metrics): ChipDef[] {
  return [
    {
      label: "Contacts",
      value: m.total,
      dot: "bg-slate-400",
      text: "text-slate-700 dark:text-slate-200",
    },
    {
      label: "Accepted",
      value: m.accepted,
      dot: "bg-sky-500",
      text: "text-sky-700 dark:text-sky-300",
      tip: `Accepted by WhatsApp. Of these: ${m.sent} sent (1 tick), ${m.deliveredTotal} delivered, ${m.read} read.`,
    },
    {
      label: "Delivered",
      value: m.deliveredTotal,
      dot: "bg-emerald-500",
      text: "text-emerald-700 dark:text-emerald-300",
      tip: "Reached the handset (2 ticks). Includes read.",
    },
    {
      label: "Read",
      value: m.read,
      dot: "bg-violet-500",
      text: "text-violet-700 dark:text-violet-300",
    },
    {
      label: "Failed",
      value: m.failed,
      dot: "bg-red-500",
      text: "text-red-700 dark:text-red-300",
    },
    {
      label: "Pending",
      value: m.pending,
      dot: "bg-amber-500",
      text: "text-amber-700 dark:text-amber-300",
    },
  ];
}

/** Compact, labelled metric chips — all six numbers, cleanly. */
export function StatChips({ m }: { m: Metrics }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5">
      {chips(m).map((c) => {
        const body = (
          <span className="inline-flex items-center gap-1.5 text-sm">
            <span className={`h-2 w-2 rounded-full ${c.dot}`} />
            <span className="text-slate-500 dark:text-slate-400">{c.label}</span>
            <span className={`font-semibold tabular-nums ${c.text}`}>
              {c.value}
            </span>
          </span>
        );
        return c.tip ? (
          <Tooltip key={c.label} content={c.tip}>
            {body}
          </Tooltip>
        ) : (
          <span key={c.label}>{body}</span>
        );
      })}
    </div>
  );
}
