import type { ResolvedBrand } from "@/config/landing";
import { Logo } from "./logo";

/**
 * Two-tone brand lockup.
 *
 *   AgentStack               ← "Agent" navy + "Stack" blue, bold sans
 *   REAL ESTATE SOLUTIONS    ← small, wide-tracked, muted, centered below
 *
 * The wordmark splits the brand name's first camelCase boundary into a
 * two-tone pair ("AgentStack" → "Agent" + "Stack"); names without an
 * internal capital render in the primary color only. `tone` picks the
 * palette: "light" for cream/white surfaces (primary navy), "dark" for
 * navy/dark surfaces (primary cream) — matching the approved mockup's
 * ON CREAM (PRIMARY) and ON NAVY (DASHBOARD) variants.
 *
 * Pure typographic logo by default (no icon mark, per the mockup);
 * pass `showMark` to opt the pipeline icon back in. If the buyer sets an
 * image logoUrl in Agency → Settings, the navbar/footer render that instead.
 */

// Official AgentStack brand palette (from the logo lockup spec):
// navy #1b3d7a base, bright blue #3b7ff2 secondary (#6ba3ff on dark).
const PALETTE = {
  light: { primary: "#1b3d7a", accent: "#3b7ff2", subline: "#3a5786" },
  dark: { primary: "#f5f0e8", accent: "#6ba3ff", subline: "#c9d3e3" },
} as const;

function splitWordmark(name: string): { primary: string; accent: string } {
  const compact = name.trim().split(/\s+/)[0] || name.trim();
  const m = compact.match(/^([A-Z][a-z]+)([A-Z].*)$/);
  if (m) return { primary: m[1], accent: m[2] };
  return { primary: compact, accent: "" };
}

/** One row of the block lockup: letters distributed flush to both edges. */
function JustifiedWord({
  word,
  className,
  style,
}: {
  word: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <span className={`flex w-full justify-between ${className ?? ""}`} style={style}>
      {word.split("").map((ch, i) => (
        <span key={i}>{ch}</span>
      ))}
    </span>
  );
}

/**
 * Stacked block hero lockup — a square composition where every row runs
 * flush left AND right to the same width:
 *
 *   A G E N T                ← navy, display size, letters justified
 *   S T A C K                ← blue, display size, letters justified
 *   REAL ESTATE SOLUTIONS    ← small, words justified across the block
 *
 * The block width is set by the display rows; the sub-line's words spread
 * to match. Subline color is darkened vs the inline lockup so it stays
 * readable as small type on mobile.
 */
export function BrandLockupStacked({
  brand,
  subline = "Real Estate Solutions",
  tone = "light",
}: {
  brand: ResolvedBrand;
  subline?: string;
  tone?: "light" | "dark";
}) {
  const { primary, accent } = splitWordmark(brand.name);
  const colors = PALETTE[tone];
  const sublineColor = colors.subline;

  return (
    <span className="inline-flex w-[11.5rem] flex-col sm:w-[13.5rem]">
      <span className="font-sans text-[3.4rem] font-extrabold uppercase leading-[0.98] tracking-tight sm:text-[4rem]">
        <JustifiedWord word={primary} style={{ color: colors.primary }} />
        {accent && <JustifiedWord word={accent} style={{ color: colors.accent }} />}
      </span>
      <span
        className="mt-1.5 flex w-full justify-between font-sans text-[10.5px] font-bold uppercase sm:text-xs"
        style={{ color: sublineColor }}
      >
        {subline.split(/\s+/).map((w, i) => (
          <span key={i}>{w}</span>
        ))}
      </span>
    </span>
  );
}

export function BrandLockup({
  brand,
  subline = "Real Estate Solutions",
  showMark = false,
  size = "md",
  tone = "light",
}: {
  brand: ResolvedBrand;
  subline?: string;
  showMark?: boolean;
  size?: "sm" | "md";
  tone?: "light" | "dark";
}) {
  const { primary, accent } = splitWordmark(brand.name);
  const colors = PALETTE[tone];

  const wordClass =
    size === "sm"
      ? "text-lg tracking-tight"
      : "text-2xl tracking-tight";
  const sublineClass = size === "sm" ? "text-[7px]" : "text-[9px]";
  // Wide, even tracking on the tagline; the negative right margin swallows
  // the trailing letter-space so the line stays visually centered.
  const sublineSpacing = size === "sm" ? "0.18em" : "0.22em";

  return (
    <span className="flex items-center gap-2">
      {showMark && (
        <Logo size={size === "sm" ? 22 : 28} idSuffix={`-lockup-${size}`} />
      )}
      <span className="inline-flex flex-col items-center leading-none">
        <span className={`font-sans font-extrabold ${wordClass}`}>
          <span style={{ color: colors.primary }}>{primary}</span>
          {accent && <span style={{ color: colors.accent }}>{accent}</span>}
        </span>
        <span
          className={`mt-1 block text-center font-sans font-semibold uppercase ${sublineClass}`}
          style={{
            color: colors.subline,
            letterSpacing: sublineSpacing,
            marginRight: `-${sublineSpacing}`,
          }}
        >
          {subline}
        </span>
      </span>
    </span>
  );
}
