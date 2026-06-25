import "server-only";

import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Public-share tokens for quotes. Format:
 *
 *   `${quoteId}.${nonce}.${HMAC-SHA256(`${quoteId}.${nonce}`, SECRET)}`
 *
 * Why the nonce: quote tokens get revoked / rotated when the operator
 * re-sends with new terms. A pure `quoteId.HMAC` token (like the
 * unsubscribe pattern) would re-issue the same string and any leaked
 * old link would keep working. By baking a 16-byte random nonce into
 * the signed payload, each issuance produces a fresh token; we store
 * the SHA-256 of the active token on the quote (`publicTokenHash`) and
 * only accept matches against that.
 *
 * Storage discipline: the RAW token is only ever exposed in the
 * outbound email URL. Firestore stores only the SHA-256 hash so a DB
 * dump can't be used to forge accept/decline requests against open
 * quotes.
 *
 * Secret rotation: same env var as unsubscribe links
 * (`AUTOMATIONS_TOKEN_SECRET`) — rotating it invalidates every
 * outstanding quote link in addition to every unsubscribe link.
 * Acceptable at v1 scale.
 */

const TOKEN_PARTS = 3;

function getSecret(): string {
  const s = process.env.AUTOMATIONS_TOKEN_SECRET;
  if (!s || s.length < 16) {
    throw new Error(
      "AUTOMATIONS_TOKEN_SECRET is not set (or too short). Generate one with `openssl rand -base64 32`.",
    );
  }
  return s;
}

/** Issue a fresh public token for a quote. Call ONLY when the operator
 *  sends (or re-sends) — the caller is responsible for persisting the
 *  returned hash to `quote.publicTokenHash`. */
export function issueQuoteToken(quoteId: string): {
  token: string;
  hash: string;
} {
  if (!/^[A-Za-z0-9_-]+$/.test(quoteId)) {
    // Defensive: Firestore auto-IDs are alphanumeric. A "." in the id
    // would break the split on verify.
    throw new Error("Unexpected quoteId format for quote token");
  }
  const nonce = randomBytes(16).toString("hex");
  const payload = `${quoteId}.${nonce}`;
  const sig = createHmac("sha256", getSecret()).update(payload).digest("hex");
  const token = `${payload}.${sig}`;
  return { token, hash: hashQuoteToken(token) };
}

/** SHA-256 hex of the token — what we persist on the quote doc. */
export function hashQuoteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Verify a presented token. Returns the quoteId on success, or null on
 * any failure (bad format, bad signature, hash mismatch). Caller is
 * responsible for loading the quote by id and confirming
 * `quote.publicTokenHash === returnedHash` — passed back as the second
 * tuple element so callers don't have to re-hash.
 *
 * Uses timing-safe comparison on the HMAC step to thwart token-recovery
 * via response-time analysis.
 */
export function verifyQuoteToken(
  token: string,
): { quoteId: string; hash: string } | null {
  const parts = token.split(".");
  if (parts.length !== TOKEN_PARTS) return null;
  const [quoteId, nonce, presentedSig] = parts;
  if (!quoteId || !nonce || !presentedSig) return null;

  let expectedSig: string;
  try {
    expectedSig = createHmac("sha256", getSecret())
      .update(`${quoteId}.${nonce}`)
      .digest("hex");
  } catch {
    return null;
  }
  if (presentedSig.length !== expectedSig.length) return null;
  const a = Buffer.from(presentedSig);
  const b = Buffer.from(expectedSig);
  if (!timingSafeEqual(a, b)) return null;

  return { quoteId, hash: hashQuoteToken(token) };
}

/** Build the full shareable URL for an outbound quote email. Empty
 *  string when NEXT_PUBLIC_APP_URL isn't configured — we'd rather see
 *  a broken link in dev than crash the send. */
export function buildQuoteUrl(token: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (!base) return "";
  return `${base}/q/${token}`;
}
