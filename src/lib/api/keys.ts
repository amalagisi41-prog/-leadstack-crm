import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { ApiKeyMode } from "@/types/api";

/**
 * Key generation + parsing for the public API.
 *
 * Format: `lsk_<mode>_<prefix>_<secret>`
 *   - `lsk_`     — vendor namespace. Makes leaked keys instantly grep-able
 *                  (logs, GitHub secret scanning, support tickets).
 *   - `<mode>`   — `live` or `test`. Encoded in the key itself so a glance
 *                  at any log line tells you which data-plane it hit.
 *   - `<prefix>` — 8 random Crockford-base32 chars. Indexed in Firestore
 *                  for O(log n) lookup at auth time. Shown in the UI and
 *                  audit logs to identify a key without revealing the secret.
 *   - `<secret>` — 32 random Crockford-base32 chars (~160 bits of entropy).
 *
 * The raw key is shown to the operator exactly once (the create response);
 * Firestore persists only the SHA-256 hex of the full string.
 */

/**
 * Crockford-base32 alphabet — no `0/O`, `1/I/L`, `U`. Reduces transcription
 * errors when an operator dictates a key over a support call.
 */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const PREFIX_LEN = 8;
const SECRET_LEN = 32;

function randomBase32(length: number): string {
  // crypto.randomBytes returns uniformly-distributed bytes; we mod into the
  // 32-char alphabet. 32 is a power of 2, so there is no modulo bias.
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += ALPHABET[bytes[i]! % 32];
  }
  return out;
}

export interface MintedApiKey {
  /** The full `lsk_<mode>_<prefix>_<secret>` — show once, never persist. */
  rawKey: string;
  prefix: string;
  hashedSecret: string;
}

export function mintApiKey(mode: ApiKeyMode): MintedApiKey {
  const prefix = randomBase32(PREFIX_LEN);
  const secret = randomBase32(SECRET_LEN);
  const rawKey = `lsk_${mode}_${prefix}_${secret}`;
  return { rawKey, prefix, hashedSecret: hashApiKey(rawKey) };
}

export function hashApiKey(rawKey: string): string {
  return createHash("sha256").update(rawKey, "utf8").digest("hex");
}

export interface ParsedApiKey {
  mode: ApiKeyMode;
  prefix: string;
}

const KEY_RE = new RegExp(
  `^lsk_(live|test)_([${ALPHABET}]{${PREFIX_LEN}})_[${ALPHABET}]{${SECRET_LEN}}$`,
);

/**
 * Parse the shape of a key WITHOUT verifying its authenticity. Returns null
 * for any malformed input so the auth middleware can early-reject without
 * touching Firestore. A successful parse only confirms the format; the
 * caller must still look up by prefix and constant-time-compare the hash.
 */
export function parseApiKey(rawKey: string): ParsedApiKey | null {
  const match = KEY_RE.exec(rawKey);
  if (!match) return null;
  return { mode: match[1] as ApiKeyMode, prefix: match[2]! };
}

/**
 * Constant-time hash comparison. Always do this BEFORE the
 * `lastUsedAt`-bump write so a timing side-channel can't reveal which keys
 * exist. `timingSafeEqual` throws on length mismatch, which itself is a
 * timing leak; we normalise lengths first by hashing both inputs at the
 * call site (SHA-256 hex is always 64 chars).
 */
export function safeEqualHash(expectedHex: string, actualHex: string): boolean {
  if (expectedHex.length !== actualHex.length) return false;
  return timingSafeEqual(
    Buffer.from(expectedHex, "utf8"),
    Buffer.from(actualHex, "utf8"),
  );
}

/**
 * Redact a raw key for logging / error messages. Keeps the namespace, mode,
 * and prefix so a human can still identify "which key was this?", and drops
 * the secret entirely.
 *
 *   lsk_live_AB12CD34_<secret>   →   lsk_live_AB12CD34_***
 *   <anything else>              →   ***redacted***
 *
 * Project-wide log redaction middleware (slice 2) calls this on every log
 * line. Use it manually for ad-hoc error messages that mention a key.
 */
export function redactApiKey(rawKey: string): string {
  const parsed = parseApiKey(rawKey);
  if (!parsed) return "***redacted***";
  return `lsk_${parsed.mode}_${parsed.prefix}_***`;
}
