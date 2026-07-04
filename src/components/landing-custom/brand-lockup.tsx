import type { ResolvedBrand } from "@/config/landing";
import { Logo } from "./logo";

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
 * Hero lockup — massive centered block with the pill sandwiched
 * between "AGENT" and "STACK":
 *
 *        A  G  E  N  T
 *   ✦ Purpose-built for REALTORS®
 *        S  T  A  C  K
 */
export function BrandLockupStacked({
  brand,
  tone = "light",
  pill,
}: {
  brand: ResolvedBrand;
  tone?: "light" | "dark";
  pill?: React.ReactNode;
}) {
  const { primary, accent } = splitWordmark(brand.name);
  const colors = PALETTE[tone];

  return (
    <span className="inline-flex w-full max-w-[22rem] flex-col items-center sm:max-w-[28rem] md:max-w-[32rem]">
      <span className="w-full font-sans text-[4.5rem] font-extrabold uppercase leading-[0.95] tracking-tight sm:text-[6rem] md:text-[7rem]">
        <JustifiedWord word={primary} style={{ color: colors.primary }} />
      </span>

      {pill && (
        <span className="my-2 sm:my-3">{pill}</span>
      )}

      {accent && (
        <span className="w-full font-sans text-[4.5rem] font-extrabold uppercase leading-[0.95] tracking-tight sm:text-[6rem] md:text-[7rem]">
          <JustifiedWord word={accent} style={{ color: colors.accent }} />
        </span>
      )}
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
