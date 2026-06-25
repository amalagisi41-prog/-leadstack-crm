import "server-only";

/**
 * In-memory rate limit for the public web-chat endpoint. Two layers:
 *
 *   - per-IP: cap how many messages a single IP can send across all
 *     sessions in a rolling hour. Stops a single attacker burning the
 *     agency's token budget by spinning up new sessions in a loop.
 *
 *   - per-session: cap how many messages one chat session can produce.
 *     Stops a single visitor (or a runaway tab) from generating
 *     thousands of replies on the same thread.
 *
 * In-memory is fine for v1 — Vercel functions are per-instance, so
 * limits are best-effort across instances. If abuse is observed, swap
 * for Upstash Redis with the same interface.
 *
 * Critical: we count INBOUND messages (visitor → bot). One inbound = at
 * most one LLM call. Outbound doesn't count toward the limit because
 * it's a function of inbound.
 */

const PER_IP_HOURLY_LIMIT = 60;
const PER_SESSION_LIMIT = 30;
const PER_IP_WINDOW_MS = 60 * 60 * 1000;

interface IpRecord {
  count: number;
  windowStartedAt: number;
}

const ipBuckets = new Map<string, IpRecord>();
const sessionBuckets = new Map<string, number>();

export interface RateLimitResult {
  ok: boolean;
  reason: "ok" | "ip-quota" | "session-quota";
  /** Seconds until the IP bucket resets. 0 for session-quota. */
  retryAfterSec: number;
}

export function checkAndCount(
  ip: string,
  sessionId: string,
): RateLimitResult {
  const now = Date.now();

  // Session cap is checked first — a single runaway session shouldn't even
  // touch the IP bucket because it's the cheaper guard.
  const sessionCount = sessionBuckets.get(sessionId) ?? 0;
  if (sessionCount >= PER_SESSION_LIMIT) {
    return { ok: false, reason: "session-quota", retryAfterSec: 0 };
  }

  // IP bucket — sliding 1h window.
  let ipBucket = ipBuckets.get(ip);
  if (!ipBucket || now - ipBucket.windowStartedAt > PER_IP_WINDOW_MS) {
    ipBucket = { count: 0, windowStartedAt: now };
  }
  if (ipBucket.count >= PER_IP_HOURLY_LIMIT) {
    const retryAfterSec = Math.max(
      1,
      Math.ceil(
        (ipBucket.windowStartedAt + PER_IP_WINDOW_MS - now) / 1000,
      ),
    );
    ipBuckets.set(ip, ipBucket); // re-persist so concurrent calls don't reset it
    return { ok: false, reason: "ip-quota", retryAfterSec };
  }

  // Both passed — commit the increments.
  ipBucket.count += 1;
  ipBuckets.set(ip, ipBucket);
  sessionBuckets.set(sessionId, sessionCount + 1);

  // Prune old IP entries opportunistically to bound memory. Cheap to
  // sweep on every call since the map should stay small per-instance.
  if (ipBuckets.size > 5000) {
    for (const [k, v] of ipBuckets) {
      if (now - v.windowStartedAt > PER_IP_WINDOW_MS) ipBuckets.delete(k);
    }
  }

  return { ok: true, reason: "ok", retryAfterSec: 0 };
}
