import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import type {
  DmInboxItem,
  DmMemberView,
  DmMessageView,
  Member,
} from "@/types/community";

/**
 * Member direct messages (1:1). Threads are sub-account-scoped (member identity
 * spans groups). Delivery is polling for v1, but the data model is
 * realtime-ready — only the client read hooks would change to upgrade.
 *
 * Permission model: two members may DM only if they share an active membership
 * in a published group AND neither has blocked the other. Same-group is checked
 * when a thread is first created; block is re-checked on every send so it takes
 * effect immediately.
 */

function toMillis(v: unknown): number | null {
  if (!v) return null;
  const m = v as { toMillis?: () => number; _seconds?: number; seconds?: number };
  if (typeof m.toMillis === "function") return m.toMillis();
  if (typeof m.seconds === "number") return m.seconds * 1000;
  if (typeof m._seconds === "number") return m._seconds * 1000;
  return null;
}

export function dmThreadId(a: string, b: string): string {
  return [a, b].sort().join("__");
}

function threadsCol(saId: string) {
  return getAdminDb().collection(`subAccounts/${saId}/dmThreads`);
}

function displayNameFor(m: Pick<Member, "displayName" | "email">): string {
  if (m.displayName && m.displayName.trim()) return m.displayName.trim();
  return m.email.split("@")[0] || "Member";
}

export async function memberViewById(
  saId: string,
  memberId: string,
): Promise<DmMemberView> {
  return memberView(saId, memberId);
}

async function memberView(
  saId: string,
  memberId: string,
): Promise<DmMemberView> {
  const snap = await getAdminDb()
    .doc(`subAccounts/${saId}/members/${memberId}`)
    .get();
  const m = snap.data() as Member | undefined;
  return {
    memberId,
    displayName: m ? displayNameFor(m) : "Former member",
    avatarUrl: m?.avatarUrl ?? null,
  };
}

/* ------------------------------- Blocking ------------------------------ */

function blockId(blockerId: string, blockedId: string) {
  return `${blockerId}__${blockedId}`;
}

export async function isBlockedPair(
  saId: string,
  a: string,
  b: string,
): Promise<boolean> {
  const db = getAdminDb();
  const [x, y] = await db.getAll(
    db.doc(`subAccounts/${saId}/dmBlocks/${blockId(a, b)}`),
    db.doc(`subAccounts/${saId}/dmBlocks/${blockId(b, a)}`),
  );
  return x.exists || y.exists;
}

export async function setBlockServerSide(opts: {
  subAccountId: string;
  blockerId: string;
  blockedId: string;
  blocked: boolean;
}): Promise<void> {
  const ref = getAdminDb().doc(
    `subAccounts/${opts.subAccountId}/dmBlocks/${blockId(opts.blockerId, opts.blockedId)}`,
  );
  if (opts.blocked) {
    await ref.set({
      blockerId: opts.blockerId,
      blockedId: opts.blockedId,
      createdAt: FieldValue.serverTimestamp(),
    });
  } else {
    await ref.delete();
  }
}

export async function hasBlocked(
  saId: string,
  blockerId: string,
  blockedId: string,
): Promise<boolean> {
  const snap = await getAdminDb()
    .doc(`subAccounts/${saId}/dmBlocks/${blockId(blockerId, blockedId)}`)
    .get();
  return snap.exists;
}

/* ---------------------------- Same-group check ------------------------- */

/** Do two members share an active membership in a published group? */
export async function shareAGroup(
  saId: string,
  a: string,
  b: string,
): Promise<boolean> {
  const db = getAdminDb();
  const groupsSnap = await db
    .collection(`subAccounts/${saId}/communityGroups`)
    .where("status", "==", "published")
    .get();
  for (const g of groupsSnap.docs) {
    const [ma, mb] = await db.getAll(
      db.doc(`subAccounts/${saId}/communityGroups/${g.id}/memberships/${a}`),
      db.doc(`subAccounts/${saId}/communityGroups/${g.id}/memberships/${b}`),
    );
    if (
      ma.exists &&
      mb.exists &&
      ma.data()!.status === "active" &&
      mb.data()!.status === "active"
    ) {
      return true;
    }
  }
  return false;
}

/**
 * List members the viewer is allowed to start a DM with: everyone active in a
 * published group the viewer is also active in, minus the viewer and minus any
 * blocked pair (either direction). Powers the "Search users" box in the Chats
 * panel. Optional `q` filters by display name (case-insensitive substring).
 */
export async function listDmableMembersServerSide(opts: {
  subAccountId: string;
  viewerId: string;
  q?: string;
  limit?: number;
}): Promise<DmMemberView[]> {
  const db = getAdminDb();
  const saId = opts.subAccountId;
  const groupsSnap = await db
    .collection(`subAccounts/${saId}/communityGroups`)
    .where("status", "==", "published")
    .get();

  const memberIds = new Set<string>();
  for (const g of groupsSnap.docs) {
    const viewerMem = await db
      .doc(
        `subAccounts/${saId}/communityGroups/${g.id}/memberships/${opts.viewerId}`,
      )
      .get();
    if (!viewerMem.exists || viewerMem.data()!.status !== "active") continue;
    const memsSnap = await db
      .collection(`subAccounts/${saId}/communityGroups/${g.id}/memberships`)
      .where("status", "==", "active")
      .get();
    for (const m of memsSnap.docs) {
      if (m.id !== opts.viewerId) memberIds.add(m.id);
    }
  }
  if (memberIds.size === 0) return [];

  // Drop blocked members (either direction).
  const [blockedByMe, blockedMe] = await Promise.all([
    db
      .collection(`subAccounts/${saId}/dmBlocks`)
      .where("blockerId", "==", opts.viewerId)
      .get(),
    db
      .collection(`subAccounts/${saId}/dmBlocks`)
      .where("blockedId", "==", opts.viewerId)
      .get(),
  ]);
  for (const d of blockedByMe.docs) memberIds.delete(d.data().blockedId as string);
  for (const d of blockedMe.docs) memberIds.delete(d.data().blockerId as string);

  const views = await Promise.all(
    [...memberIds].map((id) => memberView(saId, id)),
  );
  const q = opts.q?.trim().toLowerCase();
  const filtered = q
    ? views.filter((v) => v.displayName.toLowerCase().includes(q))
    : views;
  filtered.sort((a, b) => a.displayName.localeCompare(b.displayName));
  return filtered.slice(0, opts.limit ?? 50);
}

export interface CanDmResult {
  ok: boolean;
  reason?: string;
}

export async function canDm(
  saId: string,
  viewerId: string,
  otherId: string,
): Promise<CanDmResult> {
  if (viewerId === otherId) return { ok: false, reason: "That's you." };
  if (await isBlockedPair(saId, viewerId, otherId)) {
    return { ok: false, reason: "You can't message this member." };
  }
  if (!(await shareAGroup(saId, viewerId, otherId))) {
    return { ok: false, reason: "You can only message members of a shared group." };
  }
  return { ok: true };
}

/* ------------------------------- Messaging ----------------------------- */

export async function sendMessageServerSide(opts: {
  subAccountId: string;
  senderId: string;
  otherId: string;
  body: string;
}): Promise<{ threadId: string; message: DmMessageView }> {
  const { subAccountId: saId, senderId, otherId } = opts;
  const body = opts.body.trim();
  if (!body) throw new Error("Empty message");
  if (body.length > 5000) throw new Error("Message is too long");

  const id = dmThreadId(senderId, otherId);
  const threadRef = threadsCol(saId).doc(id);
  const existing = await threadRef.get();

  // Block always blocks; same-group is enforced when the thread is created.
  if (await isBlockedPair(saId, senderId, otherId)) {
    throw new Error("You can't message this member.");
  }
  if (!existing.exists) {
    if (!(await shareAGroup(saId, senderId, otherId))) {
      throw new Error("You can only message members of a shared group.");
    }
  }

  const msgRef = threadRef.collection("messages").doc();
  const now = FieldValue.serverTimestamp();
  const batch = getAdminDb().batch();
  batch.set(msgRef, { senderId, body, createdAt: now });
  batch.set(
    threadRef,
    {
      memberIds: [senderId, otherId].sort(),
      lastMessage: { body, senderId },
      lastMessageAt: now,
      [`reads.${senderId}`]: now,
      updatedAt: now,
      ...(existing.exists ? {} : { createdAt: now }),
    },
    { merge: true },
  );
  await batch.commit();

  return {
    threadId: id,
    message: { id: msgRef.id, senderId, body, createdAtMs: Date.now() },
  };
}

/** Verify the viewer is a participant of the thread. */
async function assertParticipant(
  saId: string,
  threadId: string,
  viewerId: string,
): Promise<string[] | null> {
  const snap = await threadsCol(saId).doc(threadId).get();
  if (!snap.exists) return null;
  const ids = (snap.data()!.memberIds as string[]) ?? [];
  return ids.includes(viewerId) ? ids : null;
}

export async function listMessagesServerSide(opts: {
  subAccountId: string;
  threadId: string;
  viewerId: string;
  sinceMs?: number;
}): Promise<DmMessageView[] | null> {
  const ids = await assertParticipant(
    opts.subAccountId,
    opts.threadId,
    opts.viewerId,
  );
  if (ids === null) return null;
  const snap = await threadsCol(opts.subAccountId)
    .doc(opts.threadId)
    .collection("messages")
    .orderBy("createdAt", "asc")
    .limit(500)
    .get();
  let rows = snap.docs.map((d) => ({
    id: d.id,
    senderId: d.data().senderId as string,
    body: d.data().body as string,
    createdAtMs: toMillis(d.data().createdAt) ?? 0,
  }));
  if (opts.sinceMs) rows = rows.filter((m) => m.createdAtMs > opts.sinceMs!);
  return rows;
}

export async function getThreadOther(opts: {
  subAccountId: string;
  threadId: string;
  viewerId: string;
}): Promise<DmMemberView | null> {
  const ids = await assertParticipant(
    opts.subAccountId,
    opts.threadId,
    opts.viewerId,
  );
  if (ids === null) return null;
  const otherId = ids.find((x) => x !== opts.viewerId);
  if (!otherId) return null;
  return memberView(opts.subAccountId, otherId);
}

export async function markThreadReadServerSide(opts: {
  subAccountId: string;
  threadId: string;
  viewerId: string;
}): Promise<void> {
  const ids = await assertParticipant(
    opts.subAccountId,
    opts.threadId,
    opts.viewerId,
  );
  if (ids === null) return;
  await threadsCol(opts.subAccountId)
    .doc(opts.threadId)
    .update({ [`reads.${opts.viewerId}`]: FieldValue.serverTimestamp() });
}

function isUnread(data: FirebaseFirestore.DocumentData, viewerId: string) {
  const lastSender = data.lastMessage?.senderId as string | undefined;
  if (!lastSender || lastSender === viewerId) return false;
  const lastAt = toMillis(data.lastMessageAt) ?? 0;
  const readAt = toMillis(data.reads?.[viewerId]) ?? 0;
  return lastAt > readAt;
}

export async function listInboxServerSide(opts: {
  subAccountId: string;
  viewerId: string;
}): Promise<DmInboxItem[]> {
  const snap = await threadsCol(opts.subAccountId)
    .where("memberIds", "array-contains", opts.viewerId)
    .get();
  const threads = snap.docs
    .map((d) => ({ id: d.id, data: d.data() }))
    .filter((t) => t.data.lastMessage)
    .sort(
      (a, b) =>
        (toMillis(b.data.lastMessageAt) ?? 0) -
        (toMillis(a.data.lastMessageAt) ?? 0),
    );

  return Promise.all(
    threads.map(async (t) => {
      const otherId =
        ((t.data.memberIds as string[]) ?? []).find(
          (x) => x !== opts.viewerId,
        ) ?? opts.viewerId;
      return {
        threadId: t.id,
        other: await memberView(opts.subAccountId, otherId),
        lastBody: (t.data.lastMessage?.body as string) ?? "",
        lastAtMs: toMillis(t.data.lastMessageAt),
        unread: isUnread(t.data, opts.viewerId),
      };
    }),
  );
}

export async function unreadThreadCount(opts: {
  subAccountId: string;
  viewerId: string;
}): Promise<number> {
  const snap = await threadsCol(opts.subAccountId)
    .where("memberIds", "array-contains", opts.viewerId)
    .get();
  return snap.docs.filter((d) => isUnread(d.data(), opts.viewerId)).length;
}
