import type { ResolvedBrand } from "@/config/landing";
import { Logo } from "./logo";

/**
 * Two-line brand lockup for the custom landing.
 *
 *   A R T I S A N          ← navy, sans-serif, enlarged, wide-tracked
 *   Real·Estate·Solutions  ← centered below, justified flush to ARTISAN's
 *                            left + right edges
 *
 * The primary word is derived from the first token of the brand name
 * (so "Artisan RE Solutions" → "ARTISAN"); the sub-line is a fixed
 * descriptor. Used in the navbar + footer in place of a single wordmark.
 * If the buyer sets an image `logoUrl` in Agency → Settings, the navbar/
 * footer render that instead.
 */

const NAVY = "#1a2f50";

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
      ? "text-lg tracking-[0.2em]"
      : "text-2xl tracking-[0.24em]";
  const sublineClass = size === "sm" ? "text-[7px]" : "text-[9px]";
  // Even (non-justified) spacing between words + generous letter tracking.
  const sublineSpacing = size === "sm" ? "0.34em" : "0.42em";

  return (
    <span className="flex items-center gap-2">
      {showMark && (
        <Logo size={size === "sm" ? 22 : 28} idSuffix={`-lockup-${size}`} />
      )}
      {/* Both lines centered on the same axis so the sub-line sits centered
          under ARTISAN with even spacing (no justify stretch). */}
      <span className="inline-flex flex-col items-center leading-none">
        <span
          className={`font-sans font-extrabold ${wordClass}`}
          style={{ color: NAVY }}
        >
          {primaryWord}
        </span>
        <span
          className={`mt-1 block text-center font-sans font-medium uppercase ${sublineClass}`}
          style={{
            color: NAVY,
            opacity: 0.7,
            letterSpacing: sublineSpacing,
            // letter-spacing adds a trailing gap after the last letter;
            // pull it back so the word stays visually centered.
            marginRight: `-${sublineSpacing}`,
          }}
        >
          {subline}
        </span>
      </span>
    </span>
  );
}
