/**
 * Public API version registry.
 *
 * Versions are date-coded (`YYYY-MM-DD`), Stripe-style. Older dates are
 * frozen — a breaking change ships as a new version, never a mutation of
 * an existing one.
 *
 * Resolution order at request time:
 *   1. `LeadStack-Version: <YYYY-MM-DD>` request header (caller pin)
 *   2. Key's `defaultVersion` stamped at mint time
 *   3. `LATEST_API_VERSION` (the most recent supported)
 *
 * Every response echoes the resolved version via `LeadStack-Version`.
 *
 * v1 ships with a single version — `LATEST_API_VERSION === "2026-06-15"`.
 * The next breaking change will add a new constant and migrate the
 * `SUPPORTED_VERSIONS` set without removing the old one (consumers don't
 * break just because we shipped a new version).
 */
export const LATEST_API_VERSION = "2026-06-15";

const SUPPORTED_VERSIONS = new Set<string>([LATEST_API_VERSION]);

/** Returns true if the given string is a supported published API version. */
export function isSupportedVersion(v: string): boolean {
  return SUPPORTED_VERSIONS.has(v);
}

/**
 * Resolve the effective version for a request. Returns null if the caller
 * pinned an unsupported version (the route should reject with 400).
 */
export function resolveVersion(opts: {
  headerVersion: string | null;
  keyDefaultVersion: string | null;
}): { version: string } | { error: string } {
  if (opts.headerVersion) {
    if (!isSupportedVersion(opts.headerVersion)) {
      return {
        error: `Unsupported API version '${opts.headerVersion}'. Supported: ${Array.from(
          SUPPORTED_VERSIONS,
        ).join(", ")}.`,
      };
    }
    return { version: opts.headerVersion };
  }
  if (opts.keyDefaultVersion && isSupportedVersion(opts.keyDefaultVersion)) {
    return { version: opts.keyDefaultVersion };
  }
  return { version: LATEST_API_VERSION };
}
