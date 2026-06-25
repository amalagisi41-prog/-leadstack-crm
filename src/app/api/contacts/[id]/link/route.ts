import "server-only";

import { NextResponse } from "next/server";
import { FieldValue, type Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { emitContactDeleted } from "@/lib/server/contacts-service";
import type { Contact } from "@/types/contacts";

/**
 * Link (merge) a Facebook/Instagram "stub" contact into an existing contact.
 *
 *   POST /api/contacts/[id]/link   body: { targetContactId }
 *
 * The scoped half of contact-merge — built for the case where a Messenger/IG
 * DM created a new contact (PSID only, no email/phone) that turns out to be
 * someone already in the CRM. [id] is the Meta stub (the loser); the body's
 * `targetContactId` is the survivor.
 *
 * Guards: sub-account admin only; the stub MUST carry a `metaUserId` (so this
 * can't be misused as a general merge); the target must be in the same
 * sub-account; and the target must not already be linked to a DIFFERENT Meta
 * identity (409). Nothing is lost: the stub's message subcollections move onto
 * the survivor, every record that referenced the stub is re-pointed, the inbox
 * conversation index is merged, the survivor gains the `metaUserId`, and the
 * stub is recursively deleted. Not reversible — the UI confirms first.
 */

const SUBCOLLECTIONS = [
  "metaMessages",
  "messages",
  "whatsappMessages",
  "notes",
  "activities",
] as const;

function tsMillis(v: unknown): number {
  const d = (v as { toMillis?: () => number } | null)?.toMillis?.();
  return typeof d === "number" ? d : 0;
}

/** Re-point a `contactId` field from the stub to the survivor, batched. */
async function repoint(
  db: FirebaseFirestore.Firestore,
  snap: FirebaseFirestore.QuerySnapshot,
  targetId: string,
): Promise<void> {
  let batch = db.batch();
  let n = 0;
  for (const d of snap.docs) {
    batch.update(d.ref, { contactId: targetId });
    if (++n % 400 === 0) {
      await batch.commit();
      batch = db.batch();
    }
  }
  if (n % 400 !== 0) await batch.commit();
}

/** Copy a stub subcollection onto the survivor (preserving doc ids). */
async function copySubcollection(
  db: FirebaseFirestore.Firestore,
  stubRef: FirebaseFirestore.DocumentReference,
  targetRef: FirebaseFirestore.DocumentReference,
  name: string,
  targetId: string,
): Promise<void> {
  const docs = await stubRef.collection(name).get();
  let batch = db.batch();
  let n = 0;
  for (const d of docs.docs) {
    const data = d.data();
    if ("contactId" in data) data.contactId = targetId;
    batch.set(targetRef.collection(name).doc(d.id), data, { merge: true });
    if (++n % 400 === 0) {
      await batch.commit();
      batch = db.batch();
    }
  }
  if (n % 400 !== 0) await batch.commit();
}

/** Merge the stub's inbox conversation index doc into the survivor's. */
async function mergeConversation(
  db: FirebaseFirestore.Firestore,
  stubId: string,
  targetId: string,
  target: Pick<Contact, "name" | "phone">,
): Promise<void> {
  const stubConvRef = db.doc(`conversations/${stubId}`);
  const targetConvRef = db.doc(`conversations/${targetId}`);
  const [s, t] = await Promise.all([stubConvRef.get(), targetConvRef.get()]);
  if (!s.exists) return; // stub never carried a conversation — nothing to merge
  const sc = s.data() ?? {};

  if (!t.exists) {
    // Survivor had no conversation — adopt the stub's, re-keyed to the survivor.
    await targetConvRef.set({
      ...sc,
      contactId: targetId,
      contactName: target.name ?? (sc.contactName as string) ?? "",
      contactPhone: target.phone || (sc.contactPhone as string) || null,
      updatedAt: FieldValue.serverTimestamp(),
    });
  } else {
    const tc = t.data() ?? {};
    const channelsSeen = Array.from(
      new Set([
        ...((tc.channelsSeen as string[]) ?? []),
        ...((sc.channelsSeen as string[]) ?? []),
      ]),
    );
    const patch: Record<string, unknown> = {
      channelsSeen,
      unreadCount:
        ((tc.unreadCount as number) ?? 0) + ((sc.unreadCount as number) ?? 0),
      updatedAt: FieldValue.serverTimestamp(),
    };
    // Adopt the stub's "last message" fields only when they're newer.
    if (tsMillis(sc.lastMessageAt) > tsMillis(tc.lastMessageAt)) {
      patch.lastChannel = sc.lastChannel;
      patch.lastDirection = sc.lastDirection;
      patch.lastMessagePreview = sc.lastMessagePreview;
      patch.lastMessageAt = sc.lastMessageAt as Timestamp;
    }
    await targetConvRef.set(patch, { merge: true });
  }
  await stubConvRef.delete().catch(() => {});
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: stubId } = await ctx.params;

  let body: { targetContactId?: string };
  try {
    body = (await request.json()) as { targetContactId?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const targetId = body.targetContactId?.trim();
  if (!targetId) {
    return NextResponse.json(
      { error: "targetContactId is required" },
      { status: 400 },
    );
  }
  if (targetId === stubId) {
    return NextResponse.json(
      { error: "Can't link a contact to itself." },
      { status: 400 },
    );
  }

  const db = getAdminDb();
  const stubRef = db.doc(`contacts/${stubId}`);
  const targetRef = db.doc(`contacts/${targetId}`);
  const [stubSnap, targetSnap] = await Promise.all([
    stubRef.get(),
    targetRef.get(),
  ]);
  if (!stubSnap.exists) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }
  const stub = stubSnap.data() as Omit<Contact, "id">;

  // Admin of the stub's sub-account (or agency owner).
  const access = await requireSubAccountAdmin(request, stub.subAccountId);
  if (access instanceof NextResponse) return access;

  // Scoped to Meta stubs — never a general merge tool.
  if (!stub.metaUserId) {
    return NextResponse.json(
      {
        error:
          "Only Facebook/Instagram contacts can be linked this way.",
      },
      { status: 400 },
    );
  }

  if (!targetSnap.exists) {
    return NextResponse.json(
      { error: "The contact to merge into wasn't found." },
      { status: 404 },
    );
  }
  const target = targetSnap.data() as Omit<Contact, "id">;
  if (target.subAccountId !== stub.subAccountId) {
    return NextResponse.json(
      { error: "Both contacts must be in the same sub-account." },
      { status: 400 },
    );
  }
  if (target.metaUserId && target.metaUserId !== stub.metaUserId) {
    return NextResponse.json(
      {
        error:
          "That contact is already linked to a different Facebook/Instagram identity.",
      },
      { status: 409 },
    );
  }

  const sub = stub.subAccountId;

  // 1. Move the stub's own subcollections onto the survivor.
  for (const name of SUBCOLLECTIONS) {
    await copySubcollection(db, stubRef, targetRef, name, targetId);
  }

  // 2. Re-point every record that referenced the stub (mirrors the
  //    contact-delete blocker set) so nothing orphans.
  const [deals, tasks, events, quotes, submissions, webChats, voiceCalls] =
    await Promise.all([
      db.collection("deals").where("subAccountId", "==", sub).where("contactId", "==", stubId).get(),
      db.collection("tasks").where("subAccountId", "==", sub).where("contactId", "==", stubId).get(),
      db.collection("events").where("subAccountId", "==", sub).where("contactId", "==", stubId).get(),
      db.collection("quotes").where("subAccountId", "==", sub).where("contactId", "==", stubId).get(),
      db.collectionGroup("submissions").where("contactId", "==", stubId).get(),
      db.collection("subAccounts").doc(sub).collection("webChatSessions").where("contactId", "==", stubId).get(),
      db.collection("subAccounts").doc(sub).collection("voiceCalls").where("contactId", "==", stubId).get(),
    ]);
  for (const snap of [deals, tasks, events, quotes, submissions, webChats, voiceCalls]) {
    await repoint(db, snap, targetId);
  }

  // 3. Merge the inbox conversation index.
  await mergeConversation(db, stubId, targetId, {
    name: target.name,
    phone: target.phone,
  });

  // 4. Survivor gains the Meta identity (idempotent if already equal).
  await targetRef.update({
    metaUserId: stub.metaUserId,
    updatedAt: FieldValue.serverTimestamp(),
  });

  // 5. Remove the stub + its (now-copied) subcollections, and fire
  //    contact.deleted from the pre-delete snapshot.
  await db.recursiveDelete(stubRef);
  emitContactDeleted({
    subAccountId: sub,
    agencyId: stub.agencyId,
    contactId: stubId,
    data: stub,
  });

  return NextResponse.json({ ok: true, targetContactId: targetId });
}
