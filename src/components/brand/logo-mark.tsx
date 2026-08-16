interface LogoMarkProps {
  size?: number;
  className?: string;
  idSuffix?: string;
  /**
   * `light` is the navy mark, for cream, white, and other light surfaces.
   * `dark` is the cream mark, for navy, black, and other dark surfaces.
   */
  tone?: "light" | "dark";
}

/**
 * Canonical AgentStack mark used across platform chrome and public surfaces.
 *
 * Both tones are the bare mark on a transparent background. The tile is
 * reserved for standalone use — install icons, marketplace listings, branding
 * and marketing artwork — because anywhere inside the product the mark is
 * already sitting on a surface, and a tile there is a second background
 * stacked on the first.
 *
 * Pick the tone from the surface behind it, not from the page's overall theme:
 * the navy mark disappears on navy, and the cream mark disappears on cream.
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
