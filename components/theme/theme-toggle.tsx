"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Light/dark toggle. The actual class is already applied pre-hydration by the
 * blocking script in `app/layout.tsx` — this just mirrors that state and lets
 * the user flip it, persisting the choice for next visit.
 */
export function ThemeToggle({
  className,
  iconOnly = false,
}: {
  className?: string;
  /** Compact variant for tight spaces (e.g. the mobile top bar) — icon only. */
  iconOnly?: boolean;
}) {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {
      // localStorage unavailable (private mode etc.) — theme just won't persist.
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      title={dark ? "Switch to light mode" : "Switch to dark mode"}
      className={cn(
        "flex items-center rounded-lg text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100",
        iconOnly ? "justify-center p-2" : "gap-3 px-3 py-2",
        className,
      )}
    >
      {dark ? (
        <Sun className="h-5 w-5 shrink-0" />
      ) : (
        <Moon className="h-5 w-5 shrink-0" />
      )}
      {!iconOnly && (dark ? "Light mode" : "Dark mode")}
    </button>
  );
}
