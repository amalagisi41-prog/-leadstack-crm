import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { buildPaypalAmountUrl } from "@/lib/paypal/payment-link";
import { emitWebhookEvent } from "@/lib/api/webhooks/dispatch";
import { getGroupById } from "@/lib/server/community-service";
import { getCourse } from "@/lib/server/community-classroom-service";
import type { Purchase, PurchaseScope } from "@/types/community";
import type { PayPalConfig } from "@/types";

/**
 * One-time PayPal purchases for group access or a single course. v1 is
 * manual-reconcile: the member pays via the sub-account's paypal.me link, then
 * a staff admin clicks "Mark paid", which grants access. The doc shape is
 * forward-compatible with Stripe auto-grant (flip status from a webhook).
 */

function purchasesCol(saId: string, groupId: string) {
  return getAdminDb().collection(
    `subAccounts/${saId}/communityGroups/${groupId}/purchases`,
  );
}

export interface RequestPurchaseResult {
  purchaseId: string;
  paypalUrl: string;
  status: Purchase["status"];
}

export async function requestPurchaseServerSide(opts: {
  subAccountId: string;
  groupId: string;
  memberId: string;
  scope: PurchaseScope;
  targetId: string;
}): Promise<RequestPurchaseResult> {
  const db = getAdminDb();
  const subSnap = await db.doc(`subAccounts/${opts.subAccountId}`).get();
  const sub = subSnap.data();
  const paypal = sub?.paypalConfig as PayPalConfig | null | undefined;
  if (!paypal?.username) {
    throw new Error(
      "This group hasn't set up payments yet. Contact the group owner.",
    );
  }
  const agencyId = (sub?.agencyId as string) ?? "";

  // Resolve the price for the target.
  let amountCents: number;
  let currency: string;
  if (opts.scope === "group") {
    const group = await getGroupById(opts.subAccountId, opts.groupId);
    if (!group || group.access !== "paid" || !group.priceCents) {
      throw new Error("This group isn't a paid group.");
    }
    amountCents = group.priceCents;
    currency = group.currency ?? "USD";
  } else {
    const course = await getCourse(opts.subAccountId, opts.groupId, opts.targetId);
    if (!course || course.access !== "purchase" || !course.priceCents) {
      throw new Error("This course isn't for sale.");
    }
    amountCents = course.priceCents;
    currency = course.currency ?? "USD";
  }

  // Idempotent: reuse an open pending purchase for the same member + target.
  const existing = await purchasesCol(opts.subAccountId, opts.groupId)
    .where("memberId", "==", opts.memberId)
    .where("scope", "==", opts.scope)
    .where("targetId", "==", opts.targetId)
    .where("status", "==", "pending")
    .limit(1)
    .get();
  if (!existing.empty) {
    const doc = existing.docs[0];
    return {
      purchaseId: doc.id,
      paypalUrl: (doc.data().paypalUrl as string) ?? "",
      status: "pending",
    };
  }

  const paypalUrl = buildPaypalAmountUrl({
    paypal,
    amount: amountCents / 100,
    currency,
  });

  const ref = await purchasesCol(opts.subAccountId, opts.groupId).add({
    subAccountId: opts.subAccountId,
    agencyId,
    groupId: opts.groupId,
    memberId: opts.memberId,
    scope: opts.scope,
    targetId: opts.targetId,
    amountCents,
    currency,
    paypalUrl,
    status: "pending",
    grantedByUid: null,
    requestedAt: FieldValue.serverTimestamp(),
    paidAt: null,
  });

  return { purchaseId: ref.id, paypalUrl, status: "pending" };
}

/** Has this member paid for this course? (Drives the unlock check.) */
export async function hasPaidCourse(
  saId: string,
  groupId: string,
  courseId: string,
  memberId: string,
): Promise<boolean> {
  const snap = await purchasesCol(saId, groupId)
    .where("memberId", "==", memberId)
    .where("scope", "==", "course")
    .where("targetId", "==", courseId)
    .where("status", "==", "paid")
    .limit(1)
    .get();
  return !snap.empty;
}

/** Staff: mark a purchase paid and grant the access it bought. */
export async function markPurchasePaidServerSide(opts: {
  subAccountId: string;
  groupId: string;
  purchaseId: string;
  grantedByUid: string;
}): Promise<{ ok: boolean }> {
  const db = getAdminDb();
  const ref = purchasesCol(opts.subAccountId, opts.groupId).doc(opts.purchaseId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("Purchase not found");
  const purchase = { id: snap.id, ...(snap.data() as Omit<Purchase, "id">) };
  if (purchase.status === "paid") return { ok: true };

  await ref.update({
    status: "paid",
    paidAt: FieldValue.serverTimestamp(),
    grantedByUid: opts.grantedByUid,
  });

  // Grant access.
  if (purchase.scope === "group") {
    const groupRef = db.doc(
      `subAccounts/${opts.subAccountId}/communityGroups/${opts.groupId}`,
    );
    const memRef = groupRef.collection("memberships").doc(purchase.memberId);
    const existing = await memRef.get();
    const wasActive =
      existing.exists && existing.data()!.status === "active";
    await memRef.set(
      {
        subAccountId: opts.subAccountId,
        agencyId: purchase.agencyId,
        groupId: opts.groupId,
        memberId: purchase.memberId,
        role: "member",
        status: "active",
        points: existing.data()?.points ?? 0,
        level: existing.data()?.level ?? 1,
        joinedAt: existing.data()?.joinedAt ?? FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    if (!wasActive) {
      await groupRef.update({ memberCount: FieldValue.increment(1) });
      void emitWebhookEvent({
        subAccountId: opts.subAccountId,
        agencyId: purchase.agencyId,
        mode: "live",
        type: "community.member.joined",
        payload: {
          groupId: opts.groupId,
          memberId: purchase.memberId,
          via: "purchase",
        },
      });
    }
  }
  // scope "course": access is read live from this paid purchase — no extra
  // write needed.

  void emitWebhookEvent({
    subAccountId: opts.subAccountId,
    agencyId: purchase.agencyId,
    mode: "live",
    type: "community.purchase.paid",
    payload: {
      purchaseId: purchase.id,
      groupId: opts.groupId,
      memberId: purchase.memberId,
      scope: purchase.scope,
      targetId: purchase.targetId,
      amountCents: purchase.amountCents,
      currency: purchase.currency,
    },
  });

  return { ok: true };
}
