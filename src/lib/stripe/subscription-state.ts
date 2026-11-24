import {
  FieldValue,
  type DocumentSnapshot,
  type Transaction,
} from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import type { SubscriptionStatus } from "@/types";

// Agencies own billing; user documents are the legacy mirror. Read through the
// transaction so simultaneous invoices cannot both observe an inactive account.
export async function readSubscriptionRecords(
  transaction: Transaction,
  customerId: string,
  subscriptionId?: string
): Promise<DocumentSnapshot[]> {
  const db = getAdminDb();
  const records: DocumentSnapshot[] = [];
  for (const collection of ["agencies", "users"]) {
    const bySubscription = subscriptionId
      ? await transaction.get(
          db
            .collection(collection)
            .where("subscriptionId", "==", subscriptionId)
        )
      : null;
    const byCustomer = await transaction.get(
      db.collection(collection).where("stripeCustomerId", "==", customerId)
    );
    const matches = new Map(
      [...byCustomer.docs, ...(bySubscription?.docs ?? [])].map((doc) => [
        doc.ref.path,
        doc,
      ])
    );
    for (const doc of matches.values()) {
      const data = doc.data()!;
      if (data.stripeCustomerId && data.stripeCustomerId !== customerId) {
        throw new Error(
          `Stripe customer/subscription mismatch at ${doc.ref.path}`
        );
      }
      // A delayed invoice for an old subscription must not activate its replacement.
      if (
        subscriptionId &&
        data.subscriptionId &&
        data.subscriptionId !== subscriptionId
      )
        continue;
      records.push(doc);
    }
    if (collection === "agencies" && records.length > 1) {
      throw new Error(`Ambiguous workspace for Stripe customer ${customerId}`);
    }
  }
  if (!records.length)
    throw new Error(
      `No workspace or user found for Stripe customer ${customerId}`
    );
  return records;
}

// The single status writer shared by checkout, subscription synchronization and
// paid invoices. Checkout/claim behavior is preserved; an already-active agency
// is not counted as a new activation just because a legacy user mirror is stale.
export function writeSubscriptionState(
  transaction: Transaction,
  records: DocumentSnapshot[],
  status: SubscriptionStatus,
  extra: Record<string, unknown> = {}
): boolean {
  const primary =
    records.find((doc) => doc.ref.path.startsWith("agencies/")) ?? records[0];
  const firstActivation =
    status === "active" &&
    primary.data()?.subscriptionStatus !== "active" &&
    !primary.data()?.subscriptionActivatedAt;
  for (const record of records) {
    const data = record.data();
    if (
      data?.subscriptionStatus === status &&
      (status !== "active" || data.subscriptionActivatedAt) &&
      Object.entries(extra).every(([key, value]) => data[key] === value)
    )
      continue;
    transaction.set(
      record.ref,
      {
        ...extra,
        subscriptionStatus: status,
        ...(status === "active" && !record.data()?.subscriptionActivatedAt
          ? { subscriptionActivatedAt: FieldValue.serverTimestamp() }
          : {}),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  }
  return firstActivation;
}
