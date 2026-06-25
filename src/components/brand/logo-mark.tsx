/**
 * LeadStack logo mark — the "Chevron Stack" variant.
 *
 * Three offset chevron-tipped bars alternating direction. Top points left,
 * middle right, bottom left — chevron tips trace the directional flow of an S
 * while alternating alignment gives the stacked-cards reading.
 *
 * Use `<LogoMark size={20} />` next to the "LeadStack" wordmark, or alone as
 * a brand glyph.
 */

interface LogoMarkProps {
  /** Square pixel size. Defaults to 20 (matches sidebar usage). */
  size?: number;
  className?: string;
  /** Optional unique suffix when multiple instances render in one document — keeps the gradient defs from colliding across SSR + hydration. */
  idSuffix?: string;
}

export function LogoMark({ size = 20, className, idSuffix = "" }: LogoMarkProps) {
  const id1 = `ls-mark-1${idSuffix}`;
  const id2 = `ls-mark-2${idSuffix}`;
  const id3 = `ls-mark-3${idSuffix}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={id1} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#6366f1" />
          <stop offset="100%" stopColor="#7c3aed" />
        </linearGradient>
        <linearGradient id={id2} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#8b5cf6" />
          <stop offset="100%" stopColor="#a855f7" />
        </linearGradient>
        <linearGradient id={id3} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#c026d3" />
          <stop offset="100%" stopColor="#ec4899" />
        </linearGradient>
      </defs>

      {/* Top chevron — points LEFT, right-aligned */}
      <path d="M 56 8 L 18 8 L 8 16 L 18 24 L 56 24 Z" fill={`url(#${id1})`} />

      {/* Middle chevron — points RIGHT, left-aligned */}
      <path d="M 8 28 L 46 28 L 56 36 L 46 44 L 8 44 Z" fill={`url(#${id2})`} />

      {/* Bottom chevron — points LEFT, right-aligned */}
      <path d="M 56 48 L 18 48 L 8 56 L 18 60 L 56 60 Z" fill={`url(#${id3})`} />
    </svg>
  );
}
