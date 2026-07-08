import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Pure-CSS hover tooltip (no client JS needed — just group-hover). Content is
 * hidden until the trigger is hovered/focused, then fades in above it.
 */
export function Tooltip({
  content,
  children,
  className,
}: {
  content: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  if (!content) return <>{children}</>;

  return (
    <span className={cn("group relative inline-block", className)}>
      <span tabIndex={0} className="cursor-default outline-none">
        {children}
      </span>
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 w-max max-w-xs -translate-x-1/2 rounded-lg bg-slate-900 px-3 py-2 text-xs font-normal leading-relaxed text-slate-100 opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100 dark:bg-slate-700"
      >
        {content}
        <span className="absolute left-1/2 top-full -mt-px h-2 w-2 -translate-x-1/2 rotate-45 bg-slate-900 dark:bg-slate-700" />
      </span>
    </span>
  );
}
