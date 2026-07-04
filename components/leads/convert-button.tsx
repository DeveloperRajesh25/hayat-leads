"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Toggle a lead's converted status. Click again to undo — no separate
 * confirmation, since it's a cheap, reversible status flag (unlike delete).
 */
export function ConvertButton({
  id,
  converted,
  className,
}: {
  id: string;
  converted: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [isConverted, setIsConverted] = useState(converted);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  async function toggle() {
    const next = !isConverted;
    setLoading(true);
    setError(false);
    try {
      const res = await fetch(`/api/leads/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ converted: next }),
      });
      if (!res.ok) {
        setError(true);
        return;
      }
      setIsConverted(next);
      router.refresh();
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  if (isConverted) {
    return (
      <button
        type="button"
        onClick={toggle}
        disabled={loading}
        title="Click to undo"
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-200 disabled:opacity-60 dark:bg-emerald-500/15 dark:text-emerald-400 dark:hover:bg-emerald-500/25",
          className,
        )}
      >
        {loading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <CheckCircle2 className="h-3.5 w-3.5" />
        )}
        Converted
      </button>
    );
  }

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <button
        type="button"
        onClick={toggle}
        disabled={loading}
        className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 transition-colors hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 disabled:opacity-60 dark:border-slate-700 dark:text-slate-300 dark:hover:border-emerald-800 dark:hover:bg-emerald-500/10 dark:hover:text-emerald-400"
      >
        {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        Mark converted
      </button>
      {error && <span className="text-xs text-red-600 dark:text-red-400">Failed</span>}
    </div>
  );
}
