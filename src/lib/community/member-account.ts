import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { createContactServerSide } from "@/lib/server/contacts-service";
import type { Member } from "@/types/community";

/**
 * Look up a member identity by email within a sub-account. Email is the natural
 * key (one identity per email per sub-account); we query rather than use a
 * deterministic doc id so an email change wouldn't orphan the doc.
 */
export async function findMemberByEmail(
  subAccountId: string,
  email: string,
): Promise<Member | null> {
  const snap = await getAdminDb()
    .collection(`subAccounts/${subAccountId}/members`)
    .where("email", "==", email.trim().toLowerCase())
    .limit(1)
    .get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  return { id: doc.id, ...(doc.data() as Omit<Member, "id">) };
}

interface EnsureMemberInput {
  subAccountId: string;
  email: string;
  displayName?: string | null;
}

/**
 * Idempotently get-or-create a member identity for `email` in this sub-account,
 * reconciling it to a CRM contact along the way (joining the community doubles
 * as lead capture). Called at magic-link VERIFY time — never at request time —
 * so a member doc only ever exists for an email whose owner clicked the link.
 *
 * Contact reconciliation: reuse an existing contact matched by email within the
 * sub-account, otherwise create one (`source: "community"`) via the same
 * server-side write path the rest of the app uses, so `contact.created` fires.
 *
 * Concurrent verify clicks for the same brand-new email could race into two
 * member docs; the 15-minute single-use magic link makes this vanishingly
 * unlikely, and a later slice can add a transactional guard if needed.
 */
export async function ensureMember({
  subAccountId,
  email,
  displayName,
}: EnsureMemberInput): Promise<Member> {
  const db = getAdminDb();
  const normalizedEmail = email.trim().toLowerCase();

  const existing = await findMemberByEmail(subAccountId, normalizedEmail);
  if (existing) return existing;

  // Resolve tenancy + the audit actor for the reconciled contact.
  const saSnap = await db.doc(`subAccounts/${subAccountId}`).get();
  if (!saSnap.exists) {
    throw new Error(`Sub-account ${subAccountId} not found`);
  }
  const sa = saSnap.data()!;
  const agencyId = (sa.agencyId as string) ?? "";
  const ownerUid = (sa.createdByUid as string) ?? "";

  // Reconcile to an existing contact by email, else create one.
  let contactId: string | null = null;
  try {
    const contactSnap = await db
      .collection("contacts")
      .where("subAccountId", "==", subAccountId)
      .where("email", "==", normalizedEmail)
      .limit(1)
      .get();
    if (!contactSnap.empty) {
      contactId = contactSnap.docs[0].id;
    } else {
      const result = await createContactServerSide({
        subAccountId,
        agencyId,
        createdByUid: ownerUid,
        mode: "live",
        name: displayName?.trim() || "",
        email: normalizedEmail,
        phone: "",
        company: "",
        address: "",
        source: "community",
        tags: [],
      });
      contactId = result.id;
    }
  } catch (err) {
    // A reconciliation blip must not block the member from signing in — the
    // contact link is recoverable, the login is not.
    console.warn("[community/member-account] contact reconcile failed", err);
  }

  const docRef = await db
    .collection(`subAccounts/${subAccountId}/members`)
    .add({
      subAccountId,
      agencyId,
      email: normalizedEmail,
      displayName: displayName?.trim() || null,
      avatarUrl: null,
      bio: "",
      contactId,
      status: "active",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      lastSeenAt: FieldValue.serverTimestamp(),
    });

  const snap = await docRef.get();
  return { id: docRef.id, ...(snap.data() as Omit<Member, "id">) };
}
