interface LogoMarkProps {
  size?: number;
  className?: string;
  idSuffix?: string;
}

/** AgentStack house mark used across platform chrome and public surfaces. */
export function LogoMark({ size = 20, className }: LogoMarkProps) {
  return (
    // This is intentionally the same raster source used by the PWA manifest so
    // every public, auth, onboarding, and in-app surface stays in sync.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/icons/icon-192.png"
      alt=""
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
    />
  );
}
