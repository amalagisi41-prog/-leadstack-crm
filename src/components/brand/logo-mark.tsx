interface LogoMarkProps {
  size?: number;
  className?: string;
  idSuffix?: string;
  /**
   * `light` is the navy/coral mark for white, cream, and other light surfaces.
   * `dark` is the self-contained blue tile for dark or colored surfaces.
   */
  tone?: "light" | "dark";
}

/**
 * Canonical AgentStack mark used across platform chrome and public surfaces.
 * Never place the cream-chevron artwork directly on a light background.
 */
export function LogoMark({
  size = 20,
  className,
  tone = "light",
}: LogoMarkProps) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={
        tone === "light"
          ? "/icons/logo-light-192.png"
          : "/icons/logo-dark-192.png"
      }
      alt=""
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
    />
  );
}
