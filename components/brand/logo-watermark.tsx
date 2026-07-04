import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * Large, faint HAYAT Interiors logo pinned behind the page content. Purely
 * decorative (aria-hidden, no pointer events) — a subtle brand mark that
 * works in both themes since it's desaturated and very low opacity.
 */
export function LogoWatermark({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none fixed inset-0 -z-10 flex select-none items-center justify-center overflow-hidden",
        className,
      )}
    >
      <div className="relative h-40 w-[min(70vw,42rem)]">
        <Image
          src="/white-logo.png"
          alt=""
          fill
          sizes="42rem"
          className="object-contain opacity-5 grayscale dark:opacity-10"
        />
      </div>
    </div>
  );
}
