import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, type = "text", ...props }, ref) => {
  return (
    <input
      ref={ref}
      type={type}
      className={cn(
        "h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400",
        "focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30",
        "disabled:cursor-not-allowed disabled:bg-slate-50",
        className,
      )}
      {...props}
    />
  );
});
Input.displayName = "Input";
