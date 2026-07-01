import type { ResolvedBrand } from "@/config/landing";
import { Logo } from "./logo";

/**
 * Two-line brand lockup for the custom landing.
 *
 *   ARTISAN
 *   Real Estate Solutions   ← small, tracked, muted
 *
 * The primary word is derived from the first token of the brand name
 * (so "Artisan RE Solutions" → "ARTISAN"); the sub-line is a fixed
 * descriptor. Used in the navbar + footer in place of a single wordmark.
 *
 * If the buyer sets an image `logoUrl` in Agency → Settings, the navbar/
 * footer render that instead — this lockup is the no-image default.
 */
export function BrandLockup({
  brand,
  subline = "Real Estate Solutions",
  showMark = true,
  size = "md",
}: {
  brand: ResolvedBrand;
  subline?: string;
  showMark?: boolean;
  size?: "sm" | "md";
}) {
  const primaryWord = (brand.name.trim().split(/\s+/)[0] || brand.name)
    .toUpperCase();

  const wordClass =
    size === "sm"
      ? "text-base leading-none"
      : "text-lg leading-none sm:text-xl";
  const sublineClass = size === "sm" ? "text-[8px]" : "text-[9px]";

  return (
    <span className="flex items-center gap-2">
      {showMark && <Logo size={size === "sm" ? 20 : 24} idSuffix={`-lockup-${size}`} />}
      <span className="flex flex-col">
        <span
          className={`bg-gradient-to-r from-blue-600 via-blue-500 to-indigo-500 bg-clip-text font-bold tracking-tight text-transparent ${wordClass}`}
        >
          {primaryWord}
        </span>
        <span
          className={`font-medium uppercase tracking-[0.18em] text-muted-foreground ${sublineClass}`}
        >
          {subline}
        </span>
      </span>
    </span>
  );
}
