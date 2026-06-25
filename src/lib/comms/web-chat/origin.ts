import "server-only";

/**
 * Origin-header enforcement for the public /api/web-chat/* endpoints.
 * The widget snippet exposes a public sub-account id — anyone can grab
 * it from a client's HTML source. The allowlist is what stops a
 * competitor from proxying the widget to drain token budget.
 *
 * Comparison rules:
 *   - case-insensitive hostname match (no protocol, no port, no path)
 *   - exact match only (no wildcards yet; revisit if buyers ask for
 *     "*.shopify.com"-style multi-site setups)
 *   - empty allowlist is treated as "test mode" — only allows requests
 *     from localhost / 127.0.0.1 / the agency's own NEXT_PUBLIC_APP_URL.
 *     This way a freshly-created channel doesn't 403 the buyer while
 *     they're configuring it, but also doesn't accept random origins.
 */

/** Strip protocol, port, path. Returns null when the input isn't parseable. */
export function hostnameFromOrigin(origin: string | null): string | null {
  if (!origin) return null;
  try {
    return new URL(origin).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** Same normalisation as hostnameFromOrigin but accepts a bare hostname
 *  in the allowlist entry too (e.g. "example.com" with no scheme). */
function normaliseEntry(entry: string): string | null {
  const trimmed = entry.trim().toLowerCase();
  if (!trimmed) return null;
  if (trimmed.includes("://")) {
    try {
      return new URL(trimmed).hostname;
    } catch {
      return null;
    }
  }
  // Bare hostname.
  return trimmed.replace(/^https?:\/\//, "").split("/")[0]!.split(":")[0]!;
}

export interface OriginCheckResult {
  allowed: boolean;
  reason: "allowlisted" | "test-mode-local" | "blocked" | "missing-origin";
  hostname: string | null;
}

export function checkOriginAllowed(
  origin: string | null,
  allowedDomains: string[],
): OriginCheckResult {
  const hostname = hostnameFromOrigin(origin);
  if (!hostname) {
    return { allowed: false, reason: "missing-origin", hostname: null };
  }

  // Configured allowlist always wins.
  if (allowedDomains.length > 0) {
    const normalised = allowedDomains
      .map(normaliseEntry)
      .filter((s): s is string => !!s);
    if (normalised.includes(hostname)) {
      return { allowed: true, reason: "allowlisted", hostname };
    }
    return { allowed: false, reason: "blocked", hostname };
  }

  // Test-mode fallback when the allowlist is empty. Accept loopback and
  // the agency's own deployed domain. Anything else gets blocked so a
  // half-configured channel still isn't a token-drain risk.
  const appHost = hostnameFromOrigin(
    process.env.NEXT_PUBLIC_APP_URL ?? null,
  );
  const testModeAllowed =
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "0.0.0.0" ||
    (appHost && hostname === appHost);
  if (testModeAllowed) {
    return { allowed: true, reason: "test-mode-local", hostname };
  }
  return { allowed: false, reason: "blocked", hostname };
}
