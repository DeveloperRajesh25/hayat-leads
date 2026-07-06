import * as React from "react";
import Link from "next/link";
import { Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "./card";
import { StatResetButton } from "./stat-reset-button";

export type StatTone =
  | "brand"
  | "emerald"
  | "red"
  | "amber"
  | "slate"
  | "sky"
  | "violet";

const toneStyles: Record<StatTone, { icon: string; value: string }> = {
  brand: {
    icon: "bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400",
    value: "text-slate-900 dark:text-slate-50",
  },
  emerald: {
    icon: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400",
    value: "text-slate-900 dark:text-slate-50",
  },
  red: {
    icon: "bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400",
    value: "text-slate-900 dark:text-slate-50",
  },
  amber: {
    icon: "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400",
    value: "text-slate-900 dark:text-slate-50",
  },
  slate: {
    icon: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
    value: "text-slate-900 dark:text-slate-50",
  },
  sky: {
    icon: "bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-400",
    value: "text-slate-900 dark:text-slate-50",
  },
  violet: {
    icon: "bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400",
    value: "text-slate-900 dark:text-slate-50",
  },
};

export function StatCard({
  label,
  value,
  icon,
  tone = "brand",
  hint,
  className,
  href,
  downloadHref,
  resetKey,
}: {
  label: string;
  value: React.ReactNode;
  icon?: React.ReactNode;
  tone?: StatTone;
  hint?: string;
  className?: string;
  /** Makes the whole card a link to view the underlying data. */
  href?: string;
  /** Adds a small per-card download button that exports this stat as CSV. */
  downloadHref?: string;
  /** Adds a small per-card "reset to zero" button for this stat key. */
  resetKey?: string;
}) {
  const styles = toneStyles[tone];
  return (
    <Card
      className={cn(
        "relative p-5",
        href && "transition-shadow hover:shadow-md hover:ring-1 hover:ring-brand-200 dark:hover:ring-brand-900",
        className,
      )}
    >
      {href && (
        <Link
          href={href}
          className="absolute inset-0 z-0 rounded-xl"
          aria-label={`View ${label}`}
        />
      )}
      <div className="relative z-[1] flex items-start justify-between gap-3 pointer-events-none">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
            {label}
          </p>
          <p className={cn("mt-2 text-3xl font-bold tracking-tight", styles.value)}>
            {value}
          </p>
          {hint && (
            <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
              {hint}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {resetKey && <StatResetButton statKey={resetKey} label={label} />}
          {downloadHref && (
            <a
              href={downloadHref}
              download
              title={`Download ${label} (CSV)`}
              aria-label={`Download ${label} as CSV`}
              className="pointer-events-auto relative z-10 flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            >
              <Download className="h-4 w-4" />
            </a>
          )}
          {icon && (
            <div
              className={cn(
                "flex h-11 w-11 shrink-0 items-center justify-center rounded-lg",
                styles.icon,
              )}
            >
              {icon}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
