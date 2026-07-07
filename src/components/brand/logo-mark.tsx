interface LogoMarkProps {
  size?: number;
  className?: string;
  idSuffix?: string;
}

/** AgentStack house mark used across platform chrome and public surfaces. */
export function LogoMark({ size = 20, className, idSuffix = "" }: LogoMarkProps) {
  const houseGradientId = `agentstack-house${idSuffix}`;

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
        <linearGradient id={houseGradientId} x1="9" y1="36" x2="55" y2="36">
          <stop offset="0%" stopColor="#173B7A" />
          <stop offset="100%" stopColor="#3B82F6" />
        </linearGradient>
      </defs>

      <circle cx="32" cy="32" r="31" fill="#FCE7F1" />
      <path
        d="M11 24 32 8l21 16"
        fill="none"
        stroke="#DB4F9B"
        strokeWidth="9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12 56V34l20-15 20 15v22"
        fill="none"
        stroke={`url(#${houseGradientId})`}
        strokeWidth="10"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect x="25" y="38" width="6" height="6" rx="1.5" fill="#E83E8C" />
      <rect x="33" y="38" width="6" height="6" rx="1.5" fill="#D25BA7" />
      <rect x="25" y="46" width="6" height="6" rx="1.5" fill="#FF7B7B" />
      <rect x="33" y="46" width="6" height="6" rx="1.5" fill="#5CC6D0" />
    </svg>
  );
}
