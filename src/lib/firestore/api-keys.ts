import "server-only";

import { FieldValue, type Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import type {
  ApiKeyDoc,
  ApiKeyMode,
  ApiKeyResponse,
  ApiKeyScope,
} from "@/types/api";

/**
 * Server-only Admin-SDK CRUD for `subAccounts/{subAccountId}/apiKeys/{keyId}`.
 *
 * Firestore rules deny all client reads + writes on this collection
 * (see firestore.rules). The operator UI hits the
 * `/api/sub-accounts/{id}/api-keys` routes which run through this helper.
 *
 * `hashedSecret` never leaves the server. `docToResponse()` strips it
 * before any value is returned to a client.
 */

function tsToDate(ts: Timestamp | Date | null | undefined): Date | null {
  if (!ts) return null;
  if (ts instanceof Date) return ts;
  if (typeof (ts as Timestamp).toDate === "function") {
    return (ts as Timestamp).toDate();
  }
  return null;
}

function snapToDoc(
  id: string,
  data: FirebaseFirestore.DocumentData,
): ApiKeyDoc {
  return {
    id,
    subAccountId: data.subAccountId,
    agencyId: data.agencyId,
    name: data.name,
    mode: data.mode,
    prefix: data.prefix,
    hashedSecret: data.hashedSecret,
    scopes: data.scopes ?? [],
    defaultVersion:
      typeof data.defaultVersion === "string" ? data.defaultVersion : undefined,
    createdByUid: data.createdByUid,
    createdAt: tsToDate(data.createdAt) ?? new Date(0),
    lastUsedAt: tsToDate(data.lastUsedAt),
    revokedAt: tsToDate(data.revokedAt),
    revokedByUid: data.revokedByUid ?? null,
  };
}

/**
 * Strip the secret hash before sending to a client. `secret` is added by
 * the caller exactly once — in the create response, after a fresh mint.
 */
export function docToResponse(doc: ApiKeyDoc): ApiKeyResponse {
  return {
    id: doc.id,
    name: doc.name,
    mode: doc.mode,
    prefix: doc.prefix,
    scopes: doc.scopes,
    defaultVersion: doc.defaultVersion,
    createdByUid: doc.createdByUid,
    createdAt: doc.createdAt.toISOString(),
    lastUsedAt: doc.lastUsedAt ? doc.lastUsedAt.toISOString() : null,
    revokedAt: doc.revokedAt ? doc.revokedAt.toISOString() : null,
  };
}

export interface CreateApiKeyInput {
  subAccountId: string;
  agencyId: string;
  name: string;
  mode: ApiKeyMode;
  prefix: string;
  hashedSecret: string;
  scopes: ApiKeyScope[];
  /**
   * API version this key is pinned to. The route stamps `LATEST_API_VERSION`
   * at mint so the key locks in the current shape; future breaking changes
   * ship as new versions without rolling over existing integrations.
   */
  defaultVersion: string;
  createdByUid: string;
}

export async function createApiKey(
  input: CreateApiKeyInput,
): Promise<ApiKeyDoc> {
  const ref = getAdminDb()
    .collection("subAccounts")
    .doc(input.subAccountId)
    .collection("apiKeys")
    .doc();

  const now = new Date();
  await ref.set({
    subAccountId: input.subAccountId,
    agencyId: input.agencyId,
    name: input.name,
    mode: input.mode,
    prefix: input.prefix,
    hashedSecret: input.hashedSecret,
    scopes: input.scopes,
    defaultVersion: input.defaultVersion,
    createdByUid: input.createdByUid,
    createdAt: FieldValue.serverTimestamp(),
    lastUsedAt: null,
    revokedAt: null,
    revokedByUid: null,
  });

  return {
    id: ref.id,
    subAccountId: input.subAccountId,
    agencyId: input.agencyId,
    name: input.name,
    mode: input.mode,
    prefix: input.prefix,
    hashedSecret: input.hashedSecret,
    scopes: input.scopes,
    defaultVersion: input.defaultVersion,
    createdByUid: input.createdByUid,
    // serverTimestamp() resolves to "now" on Firestore's clock; we return
    // the local clock for the create response — close enough, and a
    // subsequent list read will surface the real server time. The doc itself
    // carries the authoritative timestamp.
    createdAt: now,
    lastUsedAt: null,
    revokedAt: null,
    revokedByUid: null,
  };
}

export async function listApiKeys(
  subAccountId: string,
  opts: { mode?: ApiKeyMode; includeRevoked?: boolean } = {},
): Promise<ApiKeyDoc[]> {
  let q: FirebaseFirestore.Query = getAdminDb()
    .collection("subAccounts")
    .doc(subAccountId)
    .collection("apiKeys");
  if (opts.mode) q = q.where("mode", "==", opts.mode);
  const snap = await q.orderBy("createdAt", "desc").get();
  const docs = snap.docs.map((d) => snapToDoc(d.id, d.data()));
  return opts.includeRevoked
    ? docs
    : docs.filter((d) => d.revokedAt === null);
}

export async function getApiKey(
  subAccountId: string,
  keyId: string,
): Promise<ApiKeyDoc | null> {
  const snap = await getAdminDb()
    .collection("subAccounts")
    .doc(subAccountId)
    .collection("apiKeys")
    .doc(keyId)
    .get();
  if (!snap.exists) return null;
  return snapToDoc(snap.id, snap.data()!);
}

export async function revokeApiKey(
  subAccountId: string,
  keyId: string,
  revokedByUid: string,
): Promise<void> {
  await getAdminDb()
    .collection("subAccounts")
    .doc(subAccountId)
    .collection("apiKeys")
    .doc(keyId)
    .set(
      {
        revokedAt: FieldValue.serverTimestamp(),
        revokedByUid,
      },
      { merge: true },
    );
}

/**
 * Used by slice 2 (auth middleware). Looks up a candidate key by prefix
 * across every sub-account's apiKeys subcollection via a collection-group
 * query. The caller MUST then constant-time-compare the SHA-256 hash
 * before granting access — prefix alone is not a credential.
 *
 * Requires a single-field collection-group index on `prefix` (created on
 * first deploy via the Firestore console's "missing index" link, or
 * declared explicitly in firestore.indexes.json — see slice 2).
 */
export async function findApiKeyByPrefix(
  prefix: string,
): Promise<ApiKeyDoc | null> {
  const snap = await getAdminDb()
    .collectionGroup("apiKeys")
    .where("prefix", "==", prefix)
    .limit(1)
    .get();
  if (snap.empty) return null;
  const doc = snap.docs[0]!;
  return snapToDoc(doc.id, doc.data());
}

/**
 * Bump `lastUsedAt` after a successful auth. Fire-and-forget — failure to
 * write the bump must not block the API request. Slice 2 calls this from
 * the auth middleware via `void` (no await).
 */
export async function bumpApiKeyLastUsed(
  subAccountId: string,
  keyId: string,
): Promise<void> {
  await getAdminDb()
    .collection("subAccounts")
    .doc(subAccountId)
    .collection("apiKeys")
    .doc(keyId)
    .set({ lastUsedAt: FieldValue.serverTimestamp() }, { merge: true });
}
