import "server-only";

import { FieldValue, type Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import type {
  WebhookEventType,
  WebhookSubscriptionDoc,
  WebhookSubscriptionResponse,
  WebhookSubscriptionStatus,
} from "@/types/webhooks";

/**
 * Admin-SDK CRUD for `subAccounts/{id}/webhookSubscriptions/{subId}`.
 *
 * Server-only. Firestore rules deny client read + write — sub-account
 * admins talk to the `/api/sub-accounts/{id}/webhook-subscriptions`
 * management routes which proxy through this helper.
 *
 * `signingSecret` is included in `WebhookSubscriptionDoc` but stripped by
 * `docToResponse()` — secrets travel to the operator exactly once, in the
 * create response.
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
): WebhookSubscriptionDoc {
  return {
    id,
    subAccountId: data.subAccountId,
    agencyId: data.agencyId,
    mode: data.mode,
    url: data.url,
    description: data.description ?? null,
    events: (data.events ?? []) as WebhookEventType[],
    signingSecret: data.signingSecret,
    status: (data.status ?? "active") as WebhookSubscriptionStatus,
    consecutiveFailures: (data.consecutiveFailures ?? 0) as number,
    lastDeliveryAt: tsToDate(data.lastDeliveryAt),
    lastDeliveryStatus: data.lastDeliveryStatus ?? null,
    lastErrorAt: tsToDate(data.lastErrorAt),
    lastErrorMessage: data.lastErrorMessage ?? null,
    pausedAt: tsToDate(data.pausedAt),
    pausedReason: data.pausedReason ?? null,
    createdByUid: data.createdByUid,
    createdAt: tsToDate(data.createdAt) ?? new Date(0),
    updatedAt: tsToDate(data.updatedAt) ?? new Date(0),
  };
}

export function subscriptionToResponse(
  doc: WebhookSubscriptionDoc,
): WebhookSubscriptionResponse {
  return {
    id: doc.id,
    mode: doc.mode,
    url: doc.url,
    description: doc.description,
    events: doc.events,
    status: doc.status,
    consecutiveFailures: doc.consecutiveFailures,
    lastDeliveryAt: doc.lastDeliveryAt?.toISOString() ?? null,
    lastDeliveryStatus: doc.lastDeliveryStatus,
    lastErrorAt: doc.lastErrorAt?.toISOString() ?? null,
    lastErrorMessage: doc.lastErrorMessage,
    pausedAt: doc.pausedAt?.toISOString() ?? null,
    pausedReason: doc.pausedReason,
    createdAt: doc.createdAt.toISOString(),
  };
}

export interface CreateSubscriptionInput {
  subAccountId: string;
  agencyId: string;
  mode: "live" | "test";
  url: string;
  description: string | null;
  events: WebhookEventType[];
  signingSecret: string;
  createdByUid: string;
}

export async function createSubscription(
  input: CreateSubscriptionInput,
): Promise<WebhookSubscriptionDoc> {
  const ref = getAdminDb()
    .collection("subAccounts")
    .doc(input.subAccountId)
    .collection("webhookSubscriptions")
    .doc();
  const now = new Date();
  await ref.set({
    subAccountId: input.subAccountId,
    agencyId: input.agencyId,
    mode: input.mode,
    url: input.url,
    description: input.description,
    events: input.events,
    signingSecret: input.signingSecret,
    status: "active",
    consecutiveFailures: 0,
    lastDeliveryAt: null,
    lastDeliveryStatus: null,
    lastErrorAt: null,
    lastErrorMessage: null,
    pausedAt: null,
    pausedReason: null,
    createdByUid: input.createdByUid,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  return {
    id: ref.id,
    subAccountId: input.subAccountId,
    agencyId: input.agencyId,
    mode: input.mode,
    url: input.url,
    description: input.description,
    events: input.events,
    signingSecret: input.signingSecret,
    status: "active",
    consecutiveFailures: 0,
    lastDeliveryAt: null,
    lastDeliveryStatus: null,
    lastErrorAt: null,
    lastErrorMessage: null,
    pausedAt: null,
    pausedReason: null,
    createdByUid: input.createdByUid,
    createdAt: now,
    updatedAt: now,
  };
}

export async function listSubscriptions(
  subAccountId: string,
  opts: { mode?: "live" | "test" } = {},
): Promise<WebhookSubscriptionDoc[]> {
  let q: FirebaseFirestore.Query = getAdminDb()
    .collection("subAccounts")
    .doc(subAccountId)
    .collection("webhookSubscriptions");
  if (opts.mode) q = q.where("mode", "==", opts.mode);
  const snap = await q.orderBy("createdAt", "desc").get();
  return snap.docs.map((d) => snapToDoc(d.id, d.data()));
}

export async function getSubscription(
  subAccountId: string,
  subId: string,
): Promise<WebhookSubscriptionDoc | null> {
  const snap = await getAdminDb()
    .collection("subAccounts")
    .doc(subAccountId)
    .collection("webhookSubscriptions")
    .doc(subId)
    .get();
  if (!snap.exists) return null;
  return snapToDoc(snap.id, snap.data()!);
}

/**
 * List subscriptions matching the given event type + mode. Used by the
 * dispatcher to fan an event out. Empty `events` array on a subscription
 * = match every event of the right mode.
 */
export async function findMatchingSubscriptions(
  subAccountId: string,
  mode: "live" | "test",
  eventType: WebhookEventType,
): Promise<WebhookSubscriptionDoc[]> {
  const snap = await getAdminDb()
    .collection("subAccounts")
    .doc(subAccountId)
    .collection("webhookSubscriptions")
    .where("mode", "==", mode)
    .where("status", "==", "active")
    .get();
  const candidates = snap.docs.map((d) => snapToDoc(d.id, d.data()));
  return candidates.filter(
    (s) => s.events.length === 0 || s.events.includes(eventType),
  );
}

export async function updateSubscription(
  subAccountId: string,
  subId: string,
  patch: Partial<{
    url: string;
    description: string | null;
    events: WebhookEventType[];
    status: WebhookSubscriptionStatus;
    pausedReason: WebhookSubscriptionDoc["pausedReason"];
  }>,
): Promise<void> {
  const updates: Record<string, unknown> = {
    ...patch,
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (patch.status === "paused") {
    updates.pausedAt = FieldValue.serverTimestamp();
  } else if (patch.status === "active") {
    updates.pausedAt = null;
    updates.pausedReason = null;
    // Reset the failure counter on manual resume so a previously-paused
    // subscription gets a fresh circuit-breaker budget.
    updates.consecutiveFailures = 0;
  }
  await getAdminDb()
    .collection("subAccounts")
    .doc(subAccountId)
    .collection("webhookSubscriptions")
    .doc(subId)
    .set(updates, { merge: true });
}

export async function deleteSubscription(
  subAccountId: string,
  subId: string,
): Promise<void> {
  await getAdminDb()
    .collection("subAccounts")
    .doc(subAccountId)
    .collection("webhookSubscriptions")
    .doc(subId)
    .delete();
}

/**
 * Mark a delivery success against this subscription. Resets the consecutive
 * failure counter. Called from the delivery worker after a 2xx response.
 */
export async function recordSubscriptionSuccess(
  subAccountId: string,
  subId: string,
  httpStatus: number,
): Promise<void> {
  await getAdminDb()
    .collection("subAccounts")
    .doc(subAccountId)
    .collection("webhookSubscriptions")
    .doc(subId)
    .set(
      {
        consecutiveFailures: 0,
        lastDeliveryAt: FieldValue.serverTimestamp(),
        lastDeliveryStatus: httpStatus,
        lastErrorAt: null,
        lastErrorMessage: null,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
}

/**
 * Atomically bump `consecutiveFailures` and trip the circuit breaker if
 * we've hit the threshold. Returns true when the breaker fired so the
 * caller can log + (later) send an admin alert.
 *
 * Threshold (10) is hard-coded because tuning it is rarely the right move
 * — a destination dead for ten consecutive deliveries is genuinely down.
 * The shipped UI lets admins resume manually after fixing the upstream.
 */
const CIRCUIT_BREAKER_THRESHOLD = 10;

export async function recordSubscriptionFailure(
  subAccountId: string,
  subId: string,
  opts: { httpStatus: number | null; errorMessage: string },
): Promise<{ tripped: boolean }> {
  const ref = getAdminDb()
    .collection("subAccounts")
    .doc(subAccountId)
    .collection("webhookSubscriptions")
    .doc(subId);

  return getAdminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return { tripped: false };
    const data = snap.data()!;
    const prevFailures = (data.consecutiveFailures ?? 0) as number;
    const nextFailures = prevFailures + 1;
    const shouldTrip =
      nextFailures >= CIRCUIT_BREAKER_THRESHOLD && data.status === "active";
    const updates: Record<string, unknown> = {
      consecutiveFailures: nextFailures,
      lastErrorAt: FieldValue.serverTimestamp(),
      lastErrorMessage: opts.errorMessage,
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (opts.httpStatus !== null) {
      updates.lastDeliveryStatus = opts.httpStatus;
      updates.lastDeliveryAt = FieldValue.serverTimestamp();
    }
    if (shouldTrip) {
      updates.status = "paused";
      updates.pausedAt = FieldValue.serverTimestamp();
      updates.pausedReason = "circuit_breaker";
    }
    tx.set(ref, updates, { merge: true });
    return { tripped: shouldTrip };
  });
}
