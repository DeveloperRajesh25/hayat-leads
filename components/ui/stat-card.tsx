import * as React from "react";
import { cn } from "@/lib/utils";
import { Card } from "./card";

export type StatTone = "brand" | "emerald" | "red" | "amber" | "slate" | "sky";

const toneStyles: Record<StatTone, { icon: string; value: string }> = {
  brand: { icon: "bg-brand-50 text-brand-600", value: "text-slate-900" },
  emerald: { icon: "bg-emerald-50 text-emerald-600", value: "text-slate-900" },
  red: { icon: "bg-red-50 text-red-600", value: "text-slate-900" },
  amber: { icon: "bg-amber-50 text-amber-600", value: "text-slate-900" },
  slate: { icon: "bg-slate-100 text-slate-600", value: "text-slate-900" },
  sky: { icon: "bg-sky-50 text-sky-600", value: "text-slate-900" },
};

export function StatCard({
  label,
  value,
  icon,
  tone = "brand",
  hint,
  className,
}: {
  label: string;
  value: React.ReactNode;
  icon?: React.ReactNode;
  tone?: StatTone;
  hint?: string;
  className?: string;
}) {
  const styles = toneStyles[tone];
  return (
    <Card className={cn("p-5", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <p className={cn("mt-2 text-3xl font-bold tracking-tight", styles.value)}>
            {value}
          </p>
          {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
        </div>
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
    </Card>
  );
}
