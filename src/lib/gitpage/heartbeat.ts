import "server-only";

import { randomUUID } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";

/**
 * Liveness ping to gitpage so the upstream team knows this LeadStack
 * deployment is alive, plus retrieves whether the agency owner has an
 * active gitpage Agency subscription. The response is cached in
 * `system/gitpageStatus` so the website-builder UI can render
 * "subscribe to enable builds" without a second round-trip.
 *
 * Disable with `GITPAGE_TELEMETRY=off`. Off-by-default isn't appropriate
 * here — the response gates the build button, so dropping the heartbeat
 * means we can't tell the operator why their builds will fail.
 *
 * Wired in two places:
 *   - instrumentation.ts (root) — fires once per server cold start
 *   - /api/cron/gitpage-heartbeat — daily scheduled callback
 */

const HEARTBEAT_URL_PATH = "/api/v1/leadstack/heartbeat";
const APP_VERSION = "0.1.0";
const HEARTBEAT_TIMEOUT_MS = 5000;

interface HeartbeatPayload {
  instanceId: string;
  ownerEmail: string;
  version: string;
  subAccountCount?: number;
  buildsLastDay?: number;
  hasGitpageKey: boolean;
  platform?: string;
  firstBoot?: boolean;
}

interface HeartbeatResponse {
  ok: boolean;
  gitpageStatus: { agency: boolean };
}

interface HeartbeatStats {
  subAccountCount?: number;
  buildsLastDay?: number;
}

function getBaseUrl(): string {
  return (
    process.env.GITPAGE_API_URL?.replace(/\/$/, "") ?? "https://www.gitpage.site"
  );
}

function detectPlatform(): string {
  if (process.env.VERCEL) return "vercel";
  if (process.env.RENDER) return "render";
  if (process.env.RAILWAY_PROJECT_ID) return "railway";
  if (process.env.FLY_APP_NAME) return "fly";
  return "self-hosted";
}

/**
 * Resolve a stable instanceId persisted in Firestore at `system/heartbeat`.
 * Generated once on first heartbeat and reused thereafter so gitpage's
 * `leadstack_instances` collection treats this deployment as one row.
 */
async function getOrCreateInstanceId(): Promise<{
  id: string;
  firstBoot: boolean;
}> {
  const db = getAdminDb();
  const ref = db.doc("system/heartbeat");
  const snap = await ref.get();
  const existing = snap.exists ? (snap.data()?.instanceId as string | undefined) : undefined;
  if (existing) {
    return { id: existing, firstBoot: false };
  }
  const id = randomUUID();
  await ref.set(
    { instanceId: id, createdAt: FieldValue.serverTimestamp() },
    { merge: true },
  );
  return { id, firstBoot: true };
}

/**
 * Read the agency owner's email from Firestore. Falls back to the
 * BOOTSTRAP_ADMIN_EMAIL env var (which is the same address pre-bootstrap;
 * after first signup the canonical truth lives in the user doc).
 */
async function resolveOwnerEmail(): Promise<string | null> {
  const db = getAdminDb();
  try {
    const config = await db.doc("appConfig/main").get();
    const ownerUid = config.data()?.firstAgencyOwnerUid as string | undefined;
    if (ownerUid) {
      const userDoc = await db.doc(`users/${ownerUid}`).get();
      const email = userDoc.data()?.email as string | undefined;
      if (email) return email;
    }
  } catch {
    // fall through to env fallback
  }
  return process.env.BOOTSTRAP_ADMIN_EMAIL?.trim() || null;
}

/**
 * Send a heartbeat. Stats (subAccountCount, buildsLastDay) are optional —
 * the boot heartbeat omits them, the daily cron supplies them.
 *
 * Always swallows errors. Returns the response so callers can persist it
 * (typically the cron route writes it to `system/gitpageStatus`).
 */
export async function sendHeartbeat(
  stats: HeartbeatStats = {},
): Promise<HeartbeatResponse | null> {
  if (process.env.GITPAGE_TELEMETRY === "off") return null;

  let instance: { id: string; firstBoot: boolean };
  try {
    instance = await getOrCreateInstanceId();
  } catch (err) {
    console.warn("[gitpage/heartbeat] getOrCreateInstanceId failed", err);
    return null;
  }

  const ownerEmail = await resolveOwnerEmail();
  if (!ownerEmail) {
    // Pre-signup state — no owner to attribute the heartbeat to. Skip
    // silently; the next boot after signup will pick it up.
    return null;
  }

  const body: HeartbeatPayload = {
    instanceId: instance.id,
    ownerEmail,
    version: APP_VERSION,
    hasGitpageKey: Boolean(process.env.GITPAGE_API_KEY?.trim()),
    platform: detectPlatform(),
    firstBoot: instance.firstBoot,
    ...(stats.subAccountCount !== undefined
      ? { subAccountCount: stats.subAccountCount }
      : {}),
    ...(stats.buildsLastDay !== undefined
      ? { buildsLastDay: stats.buildsLastDay }
      : {}),
  };

  let res: Response;
  try {
    res = await fetch(`${getBaseUrl()}${HEARTBEAT_URL_PATH}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(HEARTBEAT_TIMEOUT_MS),
    });
  } catch (err) {
    console.warn("[gitpage/heartbeat] fetch failed", err);
    return null;
  }

  if (!res.ok) {
    console.warn("[gitpage/heartbeat] non-2xx", res.status);
    return null;
  }

  let parsed: HeartbeatResponse;
  try {
    parsed = (await res.json()) as HeartbeatResponse;
  } catch {
    return null;
  }

  // Cache the agency-status flag so the UI can render the subscribe CTA
  // without re-pinging gitpage on every page load. Tracks
  // `agencyFalseSince` (set on the true→false transition) so the UI can
  // distinguish a fresh "needs subscription" state from a "subscription
  // has lapsed for days" state.
  try {
    const db = getAdminDb();
    const ref = db.doc("system/gitpageStatus");
    const prev = await ref.get();
    const prevData = prev.exists ? prev.data() : undefined;
    const prevAgency = prevData?.agency === true;
    const newAgency = parsed.gitpageStatus?.agency === true;

    const update: Record<string, unknown> = {
      agency: newAgency,
      hasApiKey: Boolean(process.env.GITPAGE_API_KEY?.trim()),
      lastCheckedAt: FieldValue.serverTimestamp(),
      lastError: null,
    };
    if (newAgency) {
      // Reactivated — clear the false-since marker.
      update.agencyFalseSince = null;
    } else if (!prevAgency || !prevData?.agencyFalseSince) {
      // First time we've seen false (or first heartbeat ever) — stamp now.
      update.agencyFalseSince = FieldValue.serverTimestamp();
    }
    // else: still false, preserve the original agencyFalseSince.

    await ref.set(update, { merge: true });
  } catch (err) {
    console.warn("[gitpage/heartbeat] failed to cache status", err);
  }

  return parsed;
}

/**
 * Mark the cached status as ready because a real build POST just
 * succeeded (gitpage returned 202). A successful build proves both that
 * the API key is valid AND that the agency owner has an active
 * subscription — gitpage rejects builds when either fails. The heartbeat
 * can be wrong about the subscription (it checks the agency owner's
 * email, which may not match the email that owns the gitpage
 * subscription), so we override the cached status here.
 */
export async function markGitpageBuildSucceeded(): Promise<void> {
  try {
    const db = getAdminDb();
    // We only stamp `lastBuildAcceptedAt` and clear `lastError`. We do
    // NOT touch `agency` or `agencyFalseSince` — those reflect gitpage's
    // heartbeat reality and the next cron run will overwrite anything we
    // wrote here. The hook reads both fields and treats a recent build
    // as authoritative regardless of the heartbeat (handles the case
    // where the agency owner's email in our system doesn't match the
    // email tied to the gitpage subscription, but builds still work).
    await db.doc("system/gitpageStatus").set(
      {
        hasApiKey: Boolean(process.env.GITPAGE_API_KEY?.trim()),
        lastError: null,
        lastBuildAcceptedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  } catch (err) {
    console.warn("[gitpage/heartbeat] markGitpageBuildSucceeded failed", err);
  }
}

/**
 * Mark the cached status as failing because of a 401 from a real build
 * call. Used by the build route when gitpage rejects the API key — the
 * heartbeat probably still says agency: true (it checks subscription, not
 * key validity), so we override here to reflect reality and prompt the
 * operator to re-paste their key.
 */
export async function markGitpageKeyInvalid(): Promise<void> {
  try {
    const db = getAdminDb();
    const ref = db.doc("system/gitpageStatus");
    const prev = await ref.get();
    const update: Record<string, unknown> = {
      agency: false,
      lastError: "401_invalid_api_key",
      lastCheckedAt: FieldValue.serverTimestamp(),
    };
    if (!prev.exists || !prev.data()?.agencyFalseSince) {
      update.agencyFalseSince = FieldValue.serverTimestamp();
    }
    await ref.set(update, { merge: true });
  } catch (err) {
    console.warn("[gitpage/heartbeat] markGitpageKeyInvalid failed", err);
  }
}

/**
 * Lightweight stat collection for the daily heartbeat. Keep these queries
 * cheap — they run once a day so the cost is bounded.
 */
export async function collectHeartbeatStats(): Promise<HeartbeatStats> {
  const db = getAdminDb();
  const stats: HeartbeatStats = {};

  try {
    const subCount = await db.collection("subAccounts").count().get();
    stats.subAccountCount = subCount.data().count;
  } catch {
    // leave undefined
  }

  try {
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const builds = await db
      .collectionGroup("website")
      .where("lastBuildAt", ">", dayAgo)
      .count()
      .get();
    stats.buildsLastDay = builds.data().count;
  } catch {
    // collectionGroup queries on `website` may need an index; leave
    // undefined if it errors.
  }

  return stats;
}
