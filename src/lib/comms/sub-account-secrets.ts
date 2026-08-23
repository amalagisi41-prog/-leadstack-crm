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
