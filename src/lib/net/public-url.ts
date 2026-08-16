/**
 * Guard for URLs supplied by an agent that the server will then fetch.
 *
 * Anything that reaches this function is attacker-controllable in the sense
 * that matters: a sub-account admin types it, and a server-side request goes
 * out to whatever it points at. Left unchecked that is an SSRF into the
 * hosting network — cloud metadata endpoints, internal admin panels, other
 * services on the private network.
 *
 * Extracted from the website-transfer route so the liveness probe and the
 * migration record share one blocklist. A second, subtly different copy is
 * how one of them ends up missing a range.
 */

/** Hostnames that resolve inside the deployment rather than on the internet. */
const PRIVATE_HOST_PATTERNS: RegExp[] = [
  /^localhost$/i,
  /^0\.0\.0\.0$/,
  /^\[?::1\]?$/,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^169\.254\./, // link-local, incl. cloud metadata at 169.254.169.254
  /^172\.(1[6-9]|2\d|3[01])\./,
  /\.internal$/i,
  /\.local$/i,
  /\.localhost$/i,
];

/**
 * Parse and vet a public http(s) URL.
 *
 * Returns null for anything malformed, non-http, or pointing at a private or
 * loopback address. Callers that require TLS should check `protocol`
 * themselves — the migration record accepts http, a liveness probe does not.
 */
export function normalizePublicUrl(value: unknown): URL | null {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  if (!/^https?:$/.test(url.protocol)) return null;

  const host = url.hostname.toLowerCase();
  if (!host) return null;
  // A single-label host ("intranet") only resolves against an internal
  // search domain, so it can never be the public site we mean to check.
  if (!host.includes(".") && !/^\[?[\da-f:]+\]?$/i.test(host)) return null;
  if (PRIVATE_HOST_PATTERNS.some((pattern) => pattern.test(host))) return null;

  return url;
}

/** Convenience wrapper for callers that only need the vetted string back. */
export function normalizePublicUrlString(value: unknown): string | null {
  return normalizePublicUrl(value)?.toString() ?? null;
}
