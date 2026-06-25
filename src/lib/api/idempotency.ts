import "server-only";

import { createHash } from "node:crypto";
import { FieldValue, type Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import type { ApiKeyMode } from "@/types/api";

/**
 * Idempotency cache for the public API.
 *
 * On every POST / PATCH / DELETE that carries an `Idempotency-Key` header,
 * we cache `{status, body}` for 24 hours keyed by
 *   `<subAccountId>_<mode>_<idempotencyKey>`
 *
 * Behaviour:
 *   - Cache MISS  → run the handler, store the result, return it.
 *   - Cache HIT, request fingerprint matches → return the stored response.
 *   - Cache HIT, request fingerprint differs → 409 idempotency_error
 *     (same key reused with a different body — almost always a bug, never
 *     silently re-execute since the new body might do something different).
 *
 * Mode-namespaced so a test-mode replay can't ever return a cached live
 * response.
 *
 * Storage: `subAccounts/{id}/apiIdempotency/{docId}` where docId is
 * `<mode>_<keyId>_<sha-of-idempotencyKey>` — keeps the operator-supplied
 * idempotency key out of Firestore doc ids (which would show up in any
 * admin export). Server-only; Firestore rules deny client read/write.
 *
 * Expiry is lazy: we don't run a sweeper, every read checks `expiresAt`
 * against the wall clock. Firestore TTL policies could be configured to
 * auto-delete expired docs (recommended once the API is in production —
 * declare in `firestore.indexes.json` / TTL config).
 */

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_KEY_LEN = 255;
const VALID_KEY_RE = /^[A-Za-z0-9_\-:.]+$/;

export interface CachedResponse {
  status: number;
  bodyJson: unknown;
  /**
   * SHA-256 of the original request payload — used to detect "same
   * idempotency key, different body" collisions.
   */
  requestFingerprint: string;
  createdAt: Date;
  expiresAt: Date;
}

export function fingerprintRequest(method: string, path: string, rawBody: string): string {
  return createHash("sha256")
    .update(`${method.toUpperCase()} ${path}\n${rawBody}`, "utf8")
    .digest("hex");
}

function docIdFor(mode: ApiKeyMode, keyId: string, idempotencyKey: string): string {
  const keyHash = createHash("sha256")
    .update(idempotencyKey, "utf8")
    .digest("hex");
  return `${mode}_${keyId}_${keyHash}`;
}

export function isValidIdempotencyKey(key: string): boolean {
  if (key.length < 1 || key.length > MAX_KEY_LEN) return false;
  return VALID_KEY_RE.test(key);
}

function tsToDate(ts: Timestamp | Date | null | undefined): Date | null {
  if (!ts) return null;
  if (ts instanceof Date) return ts;
  if (typeof (ts as Timestamp).toDate === "function") {
    return (ts as Timestamp).toDate();
  }
  return null;
}

export async function readIdempotencyCache(
  subAccountId: string,
  mode: ApiKeyMode,
  keyId: string,
  idempotencyKey: string,
): Promise<CachedResponse | null> {
  const ref = getAdminDb()
    .collection("subAccounts")
    .doc(subAccountId)
    .collection("apiIdempotency")
    .doc(docIdFor(mode, keyId, idempotencyKey));
  const snap = await ref.get();
  if (!snap.exists) return null;
  const data = snap.data()!;
  const expiresAt = tsToDate(data.expiresAt);
  if (!expiresAt || expiresAt.getTime() <= Date.now()) {
    // Treat expired entries as a miss. Don't bother deleting here — the
    // Firestore TTL policy (configured in `firestore.indexes.json`) reaps
    // them in the background.
    return null;
  }
  return {
    status: data.status as number,
    bodyJson: data.bodyJson,
    requestFingerprint: data.requestFingerprint as string,
    createdAt: tsToDate(data.createdAt) ?? new Date(0),
    expiresAt,
  };
}

export async function writeIdempotencyCache(
  subAccountId: string,
  mode: ApiKeyMode,
  keyId: string,
  idempotencyKey: string,
  entry: { status: number; bodyJson: unknown; requestFingerprint: string },
): Promise<void> {
  const ref = getAdminDb()
    .collection("subAccounts")
    .doc(subAccountId)
    .collection("apiIdempotency")
    .doc(docIdFor(mode, keyId, idempotencyKey));
  const expiresAt = new Date(Date.now() + CACHE_TTL_MS);
  await ref.set({
    status: entry.status,
    bodyJson: entry.bodyJson,
    requestFingerprint: entry.requestFingerprint,
    mode,
    createdAt: FieldValue.serverTimestamp(),
    expiresAt,
  });
}
