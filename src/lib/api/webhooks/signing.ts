import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Stripe-style webhook signature scheme.
 *
 * Wire format:
 *   LeadStack-Signature: t=<unix_ts>,v1=<hmac_hex>
 *
 * The HMAC is computed over `${timestamp}.${rawBody}` using the
 * subscription's signing secret. Subscribers verify by:
 *   1. Parsing `t` and `v1` from the header.
 *   2. Rejecting if `t` is more than 5 minutes old (replay protection).
 *   3. Recomputing the HMAC and constant-time-comparing.
 *
 * Why timestamp-in-payload (not just headers):
 *   Pure HMAC-over-body lets an attacker who once intercepted a webhook
 *   replay it forever. By including `t` in the signed string AND in the
 *   verification window, the same bytes only verify for 5 minutes.
 *
 * `v1` is the version prefix — gives us a clean way to migrate to a new
 * scheme without breaking old subscribers (we'd emit both `v1=` and
 * `v2=` on the same header for a deprecation window).
 */

const SIGNING_VERSION = "v1";
const TOLERANCE_SECONDS = 5 * 60;

export function generateSigningSecret(): string {
  // 32 bytes → 64 hex chars. Stripe-equivalent entropy.
  return `whsec_${randomBytes(32).toString("hex")}`;
}

export interface SignedPayload {
  /** Header value to set on the outbound POST. */
  header: string;
  /** Unix timestamp (seconds) used in the signature. */
  timestamp: number;
}

export function signWebhookPayload(
  secret: string,
  rawBody: string,
  now: Date = new Date(),
): SignedPayload {
  const timestamp = Math.floor(now.getTime() / 1000);
  const signedString = `${timestamp}.${rawBody}`;
  const hmac = createHmac("sha256", secret)
    .update(signedString, "utf8")
    .digest("hex");
  return {
    header: `t=${timestamp},${SIGNING_VERSION}=${hmac}`,
    timestamp,
  };
}

/**
 * Provided so we can run our own integration tests (and document the
 * exact verification path subscribers should implement). The shipped
 * /docs/api page (slice 8) inlines this exact algorithm in code samples.
 */
export function verifyWebhookSignature(opts: {
  secret: string;
  rawBody: string;
  header: string | null;
  now?: Date;
}): { ok: boolean; reason?: string } {
  if (!opts.header) return { ok: false, reason: "missing_header" };
  const parts = opts.header.split(",").map((s) => s.trim());
  let timestampStr: string | null = null;
  let hmacStr: string | null = null;
  for (const part of parts) {
    if (part.startsWith("t=")) timestampStr = part.slice(2);
    if (part.startsWith(`${SIGNING_VERSION}=`)) {
      hmacStr = part.slice(SIGNING_VERSION.length + 1);
    }
  }
  if (!timestampStr || !hmacStr) return { ok: false, reason: "malformed_header" };
  const timestamp = Number(timestampStr);
  if (!Number.isFinite(timestamp)) {
    return { ok: false, reason: "malformed_timestamp" };
  }
  const now = Math.floor((opts.now ?? new Date()).getTime() / 1000);
  if (Math.abs(now - timestamp) > TOLERANCE_SECONDS) {
    return { ok: false, reason: "timestamp_out_of_tolerance" };
  }
  const expectedHmac = createHmac("sha256", opts.secret)
    .update(`${timestamp}.${opts.rawBody}`, "utf8")
    .digest("hex");
  if (expectedHmac.length !== hmacStr.length) {
    return { ok: false, reason: "signature_mismatch" };
  }
  const eq = timingSafeEqual(
    Buffer.from(expectedHmac, "utf8"),
    Buffer.from(hmacStr, "utf8"),
  );
  return eq ? { ok: true } : { ok: false, reason: "signature_mismatch" };
}
