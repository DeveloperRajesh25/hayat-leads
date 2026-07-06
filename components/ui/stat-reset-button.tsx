"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw, Loader2 } from "lucide-react";

/**
 * Small per-card "reset to zero" control. Records a reset baseline on the
 * server so the card starts counting again from now, then refreshes the page.
 */
export function StatResetButton({
  statKey,
  label,
}: {
  statKey: string;
  label: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

  async function handleReset(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (
      !window.confirm(
        `Reset "${label}" to zero? Older records stay in the database but will no longer be counted on this card.`,
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/stats/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: statKey }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        window.alert(data?.error ?? "Could not reset this stat.");
        return;
      }
      startTransition(() => router.refresh());
    } catch {
      window.alert("Network error while resetting this stat.");
    } finally {
      setBusy(false);
    }
  }

  const loading = busy || pending;

  return (
    <button
      type="button"
      onClick={handleReset}
      disabled={loading}
      title={`Reset ${label} to zero`}
      aria-label={`Reset ${label} to zero`}
      className="pointer-events-auto relative z-10 flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-200"
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <RotateCcw className="h-4 w-4" />
      )}
    </button>
  );
}
