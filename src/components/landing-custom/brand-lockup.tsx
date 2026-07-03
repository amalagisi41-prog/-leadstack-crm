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

const PALETTE = {
  light: { primary: "#1a2f50", accent: "#3b82f6", subline: "#64748b" },
  dark: { primary: "#f5f2ec", accent: "#7c9ff8", subline: "#94a3b8" },
} as const;

function splitWordmark(name: string): { primary: string; accent: string } {
  const compact = name.trim().split(/\s+/)[0] || name.trim();
  const m = compact.match(/^([A-Z][a-z]+)([A-Z].*)$/);
  if (m) return { primary: m[1], accent: m[2] };
  return { primary: compact, accent: "" };
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
