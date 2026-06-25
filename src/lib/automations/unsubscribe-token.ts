import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Per-contact unsubscribe tokens. Format:
 *
 *   `${contactId}.${HMAC-SHA256(contactId, AUTOMATIONS_TOKEN_SECRET)}`
 *
 * The token is self-contained — the unsubscribe page reads contactId from
 * the prefix and verifies the HMAC against the secret. No DB lookup of a
 * one-time-use token row needed.
 *
 * Rotating AUTOMATIONS_TOKEN_SECRET invalidates every outstanding link.
 * Acceptable at v1 scale.
 */

function getSecret(): string {
  const s = process.env.AUTOMATIONS_TOKEN_SECRET;
  if (!s || s.length < 16) {
    throw new Error(
      "AUTOMATIONS_TOKEN_SECRET is not set (or too short). Generate one with `openssl rand -base64 32`.",
    );
  }
  return s;
}

export function signUnsubscribeToken(contactId: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(contactId)) {
    // Defensive: Firestore auto-IDs are alphanumeric. If a contact ID ever
    // contains a "." we'd fail verification because we split on it.
    throw new Error("Unexpected contactId format for unsubscribe token");
  }
  const sig = createHmac("sha256", getSecret()).update(contactId).digest("hex");
  return `${contactId}.${sig}`;
}

/**
 * Returns the contactId if the token is valid, or null otherwise. Uses a
 * timing-safe compare to thwart token-recovery via response-time analysis.
 */
export function verifyUnsubscribeToken(token: string): string | null {
  const dot = token.indexOf(".");
  if (dot < 1) return null;
  const contactId = token.slice(0, dot);
  let expected: string;
  try {
    expected = signUnsubscribeToken(contactId);
  } catch {
    return null;
  }
  if (token.length !== expected.length) return null;
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  return timingSafeEqual(a, b) ? contactId : null;
}

/**
 * Build the full unsubscribe URL for an outbound email. Empty string when
 * NEXT_PUBLIC_APP_URL isn't configured (template still renders, just with a
 * broken link — we'd rather see that in dev than crash the send).
 */
export function buildUnsubscribeUrl(contactId: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (!base) return "";
  return `${base}/u/${signUnsubscribeToken(contactId)}`;
}
