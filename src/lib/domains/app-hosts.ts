/**
 * Which hostnames belong to AgentStack itself, as opposed to a customer's
 * connected domain.
 *
 * This is the one decision custom-domain routing needs to make on the EDGE,
 * where middleware runs. It has to be answerable without a database, because
 * the Firestore Admin SDK does not run in the Edge runtime — so the host →
 * sub-account lookup happens later, in a Node route. All middleware does is
 * decide "is this one of ours, or somebody's connected domain?"
 *
 * Deliberately conservative: anything we cannot positively identify as a
 * customer domain is treated as ours and left alone. Getting this wrong in the
 * other direction would rewrite the dashboard itself into the public site
 * renderer and take the whole app down.
 */

/** Hosts that always belong to the app, whatever else is configured. */
const ALWAYS_APP_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "[::1]",
]);

/** Strips port and lowercases, so "Example.COM:3000" → "example.com". */
export function normalizeHost(value: string | null | undefined): string {
  if (!value) return "";
  return value.trim().toLowerCase().split(":")[0];
}

/**
 * The deployment's own hostname, from NEXT_PUBLIC_APP_URL.
 *
 * Returns "" when unset or unparseable — and every caller treats that as
 * "custom domains are not configured", so routing stays off rather than
 * guessing. A deployment that cannot name itself must not start rewriting
 * hosts it cannot classify.
 */
export function appHost(): string {
  const raw = process.env.NEXT_PUBLIC_APP_URL;
  if (!raw) return "";
  try {
    return normalizeHost(new URL(raw).hostname);
  } catch {
    return "";
  }
}

/**
 * True when `host` is the app's own — the dashboard, the marketing site, a
 * Vercel preview, or local development — and must NOT be rewritten to a
 * customer's published website.
 */
export function isAppHost(host: string | null | undefined): boolean {
  const normalized = normalizeHost(host);
  if (!normalized) return true; // no host header → treat as ours, do nothing

  if (ALWAYS_APP_HOSTS.has(normalized)) return true;
  if (normalized.endsWith(".localhost")) return true;

  // Vercel-owned hosts: the production *.vercel.app domain and every preview
  // deployment. These serve the app, never a customer site.
  if (normalized.endsWith(".vercel.app")) return true;

  const own = appHost();
  if (!own) return true; // unknown own-host → never rewrite (see appHost docs)
  if (normalized === own) return true;

  // www.<appHost> is still the app.
  if (normalized === `www.${own}`) return true;

  return false;
}

/**
 * True when this request should be served as a customer's published website
 * rather than the app.
 */
export function isCustomDomainHost(host: string | null | undefined): boolean {
  return !isAppHost(host);
}
