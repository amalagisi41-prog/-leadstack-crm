interface LogoMarkProps {
  size?: number;
  className?: string;
  idSuffix?: string;
  tone?: "light" | "dark";
}

/** AgentStack house mark used across platform chrome and public surfaces. */
export function LogoMark({
  size = 20,
  className,
  tone = "light",
}: LogoMarkProps) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={tone === "light" ? "/icons/logo-light-192.png" : "/icons/icon-192.png"}
      alt=""
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
    />
  );
}
