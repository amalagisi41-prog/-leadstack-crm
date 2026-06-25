import "server-only";

import type { ApiKeyScope } from "@/types/api";

/**
 * In-memory sliding-window rate limit for the public API.
 *
 * Two per-key budgets per scope:
 *
 *                          per-minute   per-hour
 *   admin                       60        1,000
 *   forms-ingest               300        N/A (forms ingest can run hot
 *                                              from browsers and the
 *                                              minute cap is the safety
 *                                              valve we actually care
 *                                              about; hour cap would
 *                                              be a poor proxy)
 *
 * Mode-namespaced (live vs test maintain separate counters) so a burst of
 * test traffic can't lock out live integrations on the same key family.
 *
 * In-memory is the right choice for v1:
 *   - Single Vercel function instance is the common path. The limits are
 *     intentionally generous so the per-instance approximation doesn't
 *     under-count to the user's harm.
 *   - When operators report flapping limits in multi-instance deployments,
 *     swap this module for an Upstash Ratelimit wrapper without touching
 *     `auth.ts` — the public interface (`checkAndCount`) stays the same.
 *
 * Critical: only counts requests AFTER auth succeeds. Failed-auth requests
 * burn a separate, per-IP guard (`webhooksOutbound` slice 7 ships a peer
 * for unauthenticated paths). Stops a leaked-key attacker from triggering
 * a key-id-shaped DoS but still lets legitimate burst-y traffic through.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const minuteBuckets = new Map<string, Bucket>();
const hourBuckets = new Map<string, Bucket>();
const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

interface Limits {
  perMinute: number;
  perHour: number | null;
}

const LIMITS_BY_SCOPE: Record<ApiKeyScope, Limits> = {
  admin: { perMinute: 60, perHour: 1000 },
  "forms-ingest": { perMinute: 300, perHour: null },
};

export interface RateLimitResult {
  ok: boolean;
  /** Seconds until the most restrictive bucket resets. 0 when ok. */
  retryAfterSec: number;
  /** Which bucket tripped — useful in the error message. */
  window: "minute" | "hour" | null;
  /** Max requests in the tripped window (for the X-RateLimit-Limit header). */
  limit: number | null;
}

function check(
  bucketMap: Map<string, Bucket>,
  key: string,
  windowMs: number,
  limit: number,
  now: number,
): { ok: true } | { ok: false; retryAfterSec: number } {
  let b = bucketMap.get(key);
  if (!b || now >= b.resetAt) {
    b = { count: 0, resetAt: now + windowMs };
  }
  if (b.count >= limit) {
    bucketMap.set(key, b);
    return {
      ok: false,
      retryAfterSec: Math.max(1, Math.ceil((b.resetAt - now) / 1000)),
    };
  }
  b.count += 1;
  bucketMap.set(key, b);
  return { ok: true };
}

/**
 * Check + atomically count the request against the per-key limits. Returns
 * `{ ok: true }` on accept, or rejection details when the caller has
 * already burned their budget.
 *
 * Idempotent-on-throw: if BOTH windows would be accepted but one is, the
 * other was already incremented — that's fine, the user's still under
 * budget by definition.
 */
export function checkAndCount(opts: {
  keyId: string;
  mode: "live" | "test";
  scope: ApiKeyScope;
}): RateLimitResult {
  const limits = LIMITS_BY_SCOPE[opts.scope];
  const now = Date.now();
  const bucketKey = `${opts.keyId}_${opts.mode}`;

  // Minute window — always checked.
  const minute = check(
    minuteBuckets,
    `${bucketKey}_m`,
    MINUTE_MS,
    limits.perMinute,
    now,
  );
  if (!minute.ok) {
    return {
      ok: false,
      retryAfterSec: minute.retryAfterSec,
      window: "minute",
      limit: limits.perMinute,
    };
  }

  // Hour window — only when defined for this scope.
  if (limits.perHour !== null) {
    const hour = check(
      hourBuckets,
      `${bucketKey}_h`,
      HOUR_MS,
      limits.perHour,
      now,
    );
    if (!hour.ok) {
      return {
        ok: false,
        retryAfterSec: hour.retryAfterSec,
        window: "hour",
        limit: limits.perHour,
      };
    }
  }

  // Opportunistic prune to bound memory growth on long-lived instances.
  if (minuteBuckets.size > 10_000) prune(minuteBuckets, now);
  if (hourBuckets.size > 10_000) prune(hourBuckets, now);

  return { ok: true, retryAfterSec: 0, window: null, limit: null };
}

function prune(bucketMap: Map<string, Bucket>, now: number): void {
  for (const [k, b] of bucketMap) {
    if (now >= b.resetAt) bucketMap.delete(k);
  }
}

/**
 * For the response headers on every successful API call. Returns the
 * current minute-bucket state for the caller so client libraries can
 * back off proactively rather than waiting for a 429.
 *
 * Read-only — does NOT increment. Call AFTER checkAndCount succeeds.
 */
export function snapshotRemaining(opts: {
  keyId: string;
  mode: "live" | "test";
  scope: ApiKeyScope;
}): { limit: number; remaining: number; resetSec: number } {
  const limits = LIMITS_BY_SCOPE[opts.scope];
  const now = Date.now();
  const b = minuteBuckets.get(`${opts.keyId}_${opts.mode}_m`);
  if (!b || now >= b.resetAt) {
    return {
      limit: limits.perMinute,
      remaining: limits.perMinute - 1,
      resetSec: Math.ceil(MINUTE_MS / 1000),
    };
  }
  return {
    limit: limits.perMinute,
    remaining: Math.max(0, limits.perMinute - b.count),
    resetSec: Math.max(1, Math.ceil((b.resetAt - now) / 1000)),
  };
}
