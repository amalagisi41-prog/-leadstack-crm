import type { ResolvedBrand } from "@/config/landing";
import { Logo } from "./logo";

const PALETTE = {
  light: { primary: "#173B7A", accent: "#DB4F9B", subline: "#173B7A" },
  dark: { primary: "#f5f0e8", accent: "#F06AAE", subline: "#c9d3e3" },
} as const;

function splitWordmark(name: string): { primary: string; accent: string } {
  const compact = name.trim().split(/\s+/)[0] || name.trim();
  const m = compact.match(/^([A-Z][a-z]+)([A-Z].*)$/);
  if (m) return { primary: m[1], accent: m[2] };
  return { primary: compact, accent: "" };
}

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
    <span className="inline-flex flex-col items-center">
      <Logo size={96} idSuffix="-hero" tone={tone} />
      <span className="mt-3 font-sans text-5xl font-extrabold leading-none tracking-tight sm:text-6xl">
        <span style={{ color: colors.primary }}>{primary}</span>
        {accent && <span style={{ color: colors.accent }}>{accent}</span>}
      </span>
      <span
        className="mt-2 text-[10px] font-semibold uppercase sm:text-xs"
        style={{ color: colors.subline, letterSpacing: "0.28em" }}
      >
        Real Estate Solutions
      </span>
      {pill && <span className="mt-5">{pill}</span>}
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
        <Logo
          size={size === "sm" ? 22 : 28}
          idSuffix={`-lockup-${size}`}
          tone={tone}
        />
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
