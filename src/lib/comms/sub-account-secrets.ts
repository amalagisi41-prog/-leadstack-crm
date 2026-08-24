import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";

/**
 * Server-only secret storage for sub-account integrations.
 *
 * WHY THIS EXISTS
 * ---------------
 * `subAccounts/{id}` is readable by every ACTIVE member of the sub-account —
 * including the lowest `collaborator` role (see firestore.rules, the
 * `isSubMemberActive()` branch). Firestore has no field-level read rules, so
 * any credential stored on that document is readable by anyone who can read
 * the document at all.
 *
 * That is tolerable for a display name. It is not tolerable for an OAuth
 * refresh token: refresh tokens do not expire on their own and grant ongoing
 * send-as access to the operator's real Google Workspace mailbox. A
 * collaborator (or anyone who obtains a collaborator session) could extract
 * one and send mail as the business indefinitely, off-platform and invisible
 * to our logs.
 *
 * Secrets therefore live in `subAccounts/{id}/secrets/{name}`, which has an
 * explicit `allow read, write: if false` rule — no client, at any role, ever
 * reads them. Only the Admin SDK (this module) touches them.
 *
 * The PUBLIC half of each config (status, sender identity, connection
 * metadata) stays on the parent document so the settings UI can render the
 * connected state without a privileged read.
 */

const SECRETS_COLLECTION = "secrets";

export const GOOGLE_WORKSPACE_SECRET = "googleWorkspace";
export const META_SECRET = "meta";
export const GHL_IMPORT_SECRET = "ghlImport";
export const IDX_SECRET = "idx";

export interface GoogleWorkspaceSecrets {
  accessToken: string;
  refreshToken: string | null;
  /** Epoch milliseconds. Stored as a number so it survives a Firestore
   *  round-trip without Timestamp/Date ambiguity at the call site. */
  expiresAt: number;
}

function secretRef(subAccountId: string, name: string) {
  return getAdminDb().doc(
    `subAccounts/${subAccountId}/${SECRETS_COLLECTION}/${name}`,
  );
}

/**
 * Normalizes the several shapes `expiresAt` has been persisted as over the
 * life of this field: a Firestore Timestamp, a JS Date, or epoch millis.
 */
export function toEpochMillis(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value instanceof Date) return value.getTime();
  if (
    value &&
    typeof value === "object" &&
    "toDate" in value &&
    typeof (value as { toDate: unknown }).toDate === "function"
  ) {
    try {
      return (value as { toDate: () => Date }).toDate().getTime();
    } catch {
      return null;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Google Workspace
// ---------------------------------------------------------------------------

export async function writeGoogleWorkspaceSecrets(
  subAccountId: string,
  secrets: GoogleWorkspaceSecrets,
): Promise<void> {
  // Google only returns a refresh_token on the first consent for a given
  // client/user pair. On a re-consent that omits it, writing `null` here
  // would destroy the working refresh token and silently downgrade the
  // connection to "expires in an hour, then dead". Omit the field instead so
  // the merge leaves the stored one intact.
  const payload: Record<string, unknown> = {
    accessToken: secrets.accessToken,
    expiresAt: secrets.expiresAt,
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (secrets.refreshToken) {
    payload.refreshToken = secrets.refreshToken;
  }

  await secretRef(subAccountId, GOOGLE_WORKSPACE_SECRET).set(payload, {
    merge: true,
  });
}

/**
 * Reads the Google Workspace tokens for a sub-account.
 *
 * Lazily migrates connections made before this module existed: those wrote
 * `accessToken` / `refreshToken` / `expiresAt` inline on the parent
 * `subAccounts/{id}` document, where members could read them. The first read
 * after this ships copies them into the secrets subcollection and DELETES the
 * inline copies, so the exposure window closes on its own without a manual
 * backfill. Same lazy one-time-split shape as
 * `lib/comms/ai/agent.ts::maybeMigrateLegacy()`.
 *
 * Returns null when the sub-account has no stored tokens at all.
 */
export async function loadGoogleWorkspaceSecrets(
  subAccountId: string,
): Promise<GoogleWorkspaceSecrets | null> {
  const ref = secretRef(subAccountId, GOOGLE_WORKSPACE_SECRET);
  const snap = await ref.get();

  if (snap.exists) {
    const data = snap.data() as Partial<GoogleWorkspaceSecrets> | undefined;
    if (data?.accessToken) {
      return {
        accessToken: data.accessToken,
        refreshToken: data.refreshToken ?? null,
        expiresAt: toEpochMillis(data.expiresAt) ?? 0,
      };
    }
  }

  return migrateLegacyGoogleWorkspaceSecrets(subAccountId);
}

async function migrateLegacyGoogleWorkspaceSecrets(
  subAccountId: string,
): Promise<GoogleWorkspaceSecrets | null> {
  const db = getAdminDb();
  const parentRef = db.doc(`subAccounts/${subAccountId}`);
  const parentSnap = await parentRef.get();
  if (!parentSnap.exists) return null;

  const legacy = parentSnap.data()?.googleWorkspaceConfig as
    | {
        accessToken?: string;
        refreshToken?: string | null;
        expiresAt?: unknown;
      }
    | undefined;

  if (!legacy?.accessToken) return null;

  const secrets: GoogleWorkspaceSecrets = {
    accessToken: legacy.accessToken,
    refreshToken: legacy.refreshToken ?? null,
    expiresAt: toEpochMillis(legacy.expiresAt) ?? 0,
  };

  await writeGoogleWorkspaceSecrets(subAccountId, secrets);

  // Strip the inline copies. This is the whole point of the migration — the
  // secrets are useless in the subcollection if they also stay readable on
  // the parent doc.
  await parentRef.update({
    "googleWorkspaceConfig.accessToken": FieldValue.delete(),
    "googleWorkspaceConfig.refreshToken": FieldValue.delete(),
    "googleWorkspaceConfig.expiresAt": FieldValue.delete(),
  });

  console.info(
    `[sub-account-secrets] migrated inline Google Workspace tokens to secrets subcollection for sa=${subAccountId}`,
  );

  return secrets;
}

export async function deleteGoogleWorkspaceSecrets(
  subAccountId: string,
): Promise<void> {
  await secretRef(subAccountId, GOOGLE_WORKSPACE_SECRET).delete();
}

// ---------------------------------------------------------------------------
// Shared migration helper
// ---------------------------------------------------------------------------

/**
 * Moves inline credential fields off `subAccounts/{id}` into the secrets
 * subcollection, one integration at a time.
 *
 * Every integration below follows the identical shape, so the sequencing lives
 * here rather than being retyped (and subtly varied) three times:
 *
 *   1. Read the secrets doc. If it already holds the credential, done.
 *   2. Otherwise read the parent's config object and look for the inline copy.
 *   3. Copy it into the secrets doc FIRST, then delete the inline fields.
 *
 * Order matters in step 3. Deleting before writing would, on a crash between
 * the two, destroy a credential the operator would then have to re-obtain from
 * a third party. Writing first is idempotent: a crash after the write leaves a
 * readable duplicate that the next call cleans up.
 *
 * `publicPatch` is applied in the same update as the deletes. It exists because
 * some UI derived "is this connected?" from the presence of the secret itself —
 * deleting the secret without leaving a public marker behind would show a
 * working integration as disconnected.
 */
async function migrateInlineSecret<T extends object>(opts: {
  subAccountId: string;
  secretName: string;
  /** The field on `subAccounts/{id}` holding the config object. */
  parentField: string;
  /** Reads the secret out of the legacy inline config; null when absent. */
  extract: (legacy: Record<string, unknown>) => T | null;
  /** Inline field paths to delete, relative to `parentField`. */
  inlineFields: string[];
  /** Non-secret fields to set on the parent in the same write. */
  publicPatch?: Record<string, unknown>;
}): Promise<T | null> {
  const db = getAdminDb();
  const parentRef = db.doc(`subAccounts/${opts.subAccountId}`);
  const parentSnap = await parentRef.get();
  if (!parentSnap.exists) return null;

  const legacy = parentSnap.data()?.[opts.parentField] as
    | Record<string, unknown>
    | undefined;
  if (!legacy) return null;

  const secrets = opts.extract(legacy);
  if (!secrets) return null;

  await secretRef(opts.subAccountId, opts.secretName).set(
    { ...secrets, updatedAt: FieldValue.serverTimestamp() },
    { merge: true },
  );

  const update: Record<string, unknown> = { ...(opts.publicPatch ?? {}) };
  for (const field of opts.inlineFields) {
    update[`${opts.parentField}.${field}`] = FieldValue.delete();
  }
  await parentRef.update(update);

  console.info(
    `[sub-account-secrets] migrated inline ${opts.secretName} credentials to secrets subcollection for sa=${opts.subAccountId}`,
  );

  return secrets;
}

// ---------------------------------------------------------------------------
// Meta (Facebook Page + Instagram) — one Page access token
// ---------------------------------------------------------------------------

export interface MetaSecrets {
  /**
   * Long-lived Page access token. Sends and receives on Messenger + IG DM,
   * publishes Social Planner posts, and (un)subscribes the Page to our webhook.
   *
   * Long-lived means roughly 60 days with no user interaction, and Meta renews
   * it on use — so a leaked one is a durable ability to post as the business
   * and read its DMs, not a brief window.
   */
  pageAccessToken: string;
}

export async function writeMetaSecrets(
  subAccountId: string,
  secrets: MetaSecrets,
): Promise<void> {
  await secretRef(subAccountId, META_SECRET).set(
    { ...secrets, updatedAt: FieldValue.serverTimestamp() },
    { merge: true },
  );
}

export async function loadMetaSecrets(
  subAccountId: string,
): Promise<MetaSecrets | null> {
  const snap = await secretRef(subAccountId, META_SECRET).get();
  const token = snap.data()?.pageAccessToken;
  if (typeof token === "string" && token) return { pageAccessToken: token };

  return migrateInlineSecret<MetaSecrets>({
    subAccountId,
    secretName: META_SECRET,
    parentField: "metaConfig",
    inlineFields: ["pageAccessToken"],
    extract: (legacy) => {
      const value = legacy.pageAccessToken;
      return typeof value === "string" && value
        ? { pageAccessToken: value }
        : null;
    },
  });
}

export async function deleteMetaSecrets(subAccountId: string): Promise<void> {
  await secretRef(subAccountId, META_SECRET).delete();
}

// ---------------------------------------------------------------------------
// GoHighLevel import — Private Integration Token or OAuth pair
// ---------------------------------------------------------------------------

export interface GhlImportSecrets {
  /** Private Integration Token (`pit-…`) or the OAuth access token. */
  token: string;
  /** OAuth refresh token. Null for the Private-Integration-Token path. */
  refreshToken: string | null;
}

export async function writeGhlImportSecrets(
  subAccountId: string,
  secrets: GhlImportSecrets,
): Promise<void> {
  await secretRef(subAccountId, GHL_IMPORT_SECRET).set(
    {
      token: secrets.token,
      refreshToken: secrets.refreshToken,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}

export async function loadGhlImportSecrets(
  subAccountId: string,
): Promise<GhlImportSecrets | null> {
  const snap = await secretRef(subAccountId, GHL_IMPORT_SECRET).get();
  const data = snap.data();
  if (typeof data?.token === "string" && data.token) {
    return {
      token: data.token,
      refreshToken:
        typeof data.refreshToken === "string" ? data.refreshToken : null,
    };
  }

  return migrateInlineSecret<GhlImportSecrets>({
    subAccountId,
    secretName: GHL_IMPORT_SECRET,
    parentField: "ghlImportConfig",
    inlineFields: ["token", "refreshToken"],
    // The settings UI showed "connected" by testing for the token itself.
    // Stamp the public marker in the same write that removes it.
    publicPatch: { "ghlImportConfig.connected": true },
    extract: (legacy) => {
      const token = legacy.token;
      if (typeof token !== "string" || !token) return null;
      return {
        token,
        refreshToken:
          typeof legacy.refreshToken === "string" ? legacy.refreshToken : null,
      };
    },
  });
}

export async function deleteGhlImportSecrets(
  subAccountId: string,
): Promise<void> {
  await secretRef(subAccountId, GHL_IMPORT_SECRET).delete();
}

// ---------------------------------------------------------------------------
// IDX Broker — Platinum API access key
// ---------------------------------------------------------------------------

export interface IdxSecrets {
  accessKey: string;
}

export async function writeIdxSecrets(
  subAccountId: string,
  secrets: IdxSecrets,
): Promise<void> {
  await secretRef(subAccountId, IDX_SECRET).set(
    { ...secrets, updatedAt: FieldValue.serverTimestamp() },
    { merge: true },
  );
}

export async function loadIdxSecrets(
  subAccountId: string,
): Promise<IdxSecrets | null> {
  const snap = await secretRef(subAccountId, IDX_SECRET).get();
  const key = snap.data()?.accessKey;
  if (typeof key === "string" && key) return { accessKey: key };

  return migrateInlineSecret<IdxSecrets>({
    subAccountId,
    secretName: IDX_SECRET,
    parentField: "idxConfig",
    inlineFields: ["accessKey"],
    // Same reason as GHL: `connected` was derived from the key's presence.
    publicPatch: { "idxConfig.connected": true },
    extract: (legacy) => {
      const value = legacy.accessKey;
      return typeof value === "string" && value ? { accessKey: value } : null;
    },
  });
}

export async function deleteIdxSecrets(subAccountId: string): Promise<void> {
  await secretRef(subAccountId, IDX_SECRET).delete();
}

// ---------------------------------------------------------------------------
// FOLLOW-UP: twilioConfig.authToken
// ---------------------------------------------------------------------------
// `twilioConfig.authToken` sits on the same member-readable parent document
// and has the same exposure. It is deliberately NOT migrated here.
//
// It is read directly (as part of the whole `TwilioConfig` object) by ~14 call
// sites, including the Twilio and WhatsApp inbound webhooks, which use it to
// verify request signatures. Migrating it means converting every one of those
// in lockstep — a lazy migration that deletes the inline copy would break any
// path still reading it, and those paths include live inbound messaging.
//
// That refactor is worth doing, but it belongs in its own change so it can be
// tested and rolled back independently of the Gmail fix. Adding a dormant
// `loadTwilioSecrets()` here would be worse than leaving it out: the first
// caller to touch it would silently delete a credential the other 13 still read.
