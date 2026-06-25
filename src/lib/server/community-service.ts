import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { emitWebhookEvent } from "@/lib/api/webhooks/dispatch";
import { ABOUT_MAX_CHARS, TAGLINE_MAX_CHARS } from "@/config/community";
import type {
  CommunityGroup,
  GroupAccess,
  GroupJoinPolicy,
  GroupMembership,
  GroupStatus,
  ResourceLink,
} from "@/types/community";

/** Normalize an admin-entered link list: trim, drop empties, cap at 10. */
function cleanLinks(links: ResourceLink[]): ResourceLink[] {
  return links
    .filter((l) => l && l.url?.trim())
    .map((l) => ({ label: l.label?.trim() || l.url.trim(), url: l.url.trim() }))
    .slice(0, 10);
}

/**
 * Server-side write service for Community groups + memberships — the single
 * Admin-SDK chokepoint. Members never write Firestore directly; staff actions
 * POST to /api/sub-accounts/[id]/community/* and member actions to
 * /api/community/*, both landing here. Rules keep the client write path closed.
 */

function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "group"
  );
}

/**
 * Produce a slug unique within the sub-account. Appends -2, -3, … on collision.
 * `excludeGroupId` lets an update keep its own slug when the name is unchanged.
 */
async function uniqueSlug(
  subAccountId: string,
  base: string,
  excludeGroupId?: string,
): Promise<string> {
  const db = getAdminDb();
  const col = db.collection(`subAccounts/${subAccountId}/communityGroups`);
  const root = slugify(base);
  for (let i = 1; i < 50; i++) {
    const candidate = i === 1 ? root : `${root}-${i}`;
    const snap = await col.where("slug", "==", candidate).limit(1).get();
    if (snap.empty || snap.docs[0].id === excludeGroupId) return candidate;
  }
  // Pathological fallback — unlikely past 49 same-named groups.
  return `${root}-${Date.now()}`;
}

export interface CreateGroupInput {
  subAccountId: string;
  agencyId: string;
  createdByUid: string;
  name: string;
  about?: string;
  tagline?: string;
  coverUrl?: string | null;
  cardImageUrl?: string | null;
  logoUrl?: string | null;
  brandColor?: string | null;
  access?: GroupAccess;
  priceCents?: number | null;
  currency?: string | null;
  joinPolicy?: GroupJoinPolicy;
  status?: GroupStatus;
}

export async function createGroupServerSide(
  input: CreateGroupInput,
): Promise<CommunityGroup> {
  const db = getAdminDb();
  const slug = await uniqueSlug(input.subAccountId, input.name);
  const access: GroupAccess = input.access ?? "free";

  const doc = {
    subAccountId: input.subAccountId,
    agencyId: input.agencyId,
    createdByUid: input.createdByUid,
    name: input.name.trim(),
    slug,
    about: (input.about?.trim() ?? "").slice(0, ABOUT_MAX_CHARS),
    tagline: (input.tagline?.trim() ?? "").slice(0, TAGLINE_MAX_CHARS),
    coverUrl: input.coverUrl ?? null,
    cardImageUrl: input.cardImageUrl ?? null,
    logoUrl: input.logoUrl ?? null,
    brandColor: input.brandColor ?? null,
    access,
    priceCents: access === "paid" ? (input.priceCents ?? null) : null,
    currency: access === "paid" ? (input.currency ?? "USD") : null,
    joinPolicy: input.joinPolicy ?? "open",
    pointsEnabled: true,
    categories: ["General"],
    links: [],
    status: input.status ?? "draft",
    memberCount: 0,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };

  const ref = await db
    .collection(`subAccounts/${input.subAccountId}/communityGroups`)
    .add(doc);
  return { id: ref.id, ...doc } as CommunityGroup;
}

export interface UpdateGroupPatch {
  name?: string;
  about?: string;
  tagline?: string;
  coverUrl?: string | null;
  cardImageUrl?: string | null;
  logoUrl?: string | null;
  brandColor?: string | null;
  access?: GroupAccess;
  priceCents?: number | null;
  currency?: string | null;
  joinPolicy?: GroupJoinPolicy;
  status?: GroupStatus;
  categories?: string[];
  links?: ResourceLink[];
}

export async function updateGroupServerSide(opts: {
  subAccountId: string;
  groupId: string;
  patch: UpdateGroupPatch;
}): Promise<CommunityGroup | null> {
  const db = getAdminDb();
  const ref = db.doc(
    `subAccounts/${opts.subAccountId}/communityGroups/${opts.groupId}`,
  );
  const snap = await ref.get();
  if (!snap.exists) return null;

  const updates: Record<string, unknown> = {
    updatedAt: FieldValue.serverTimestamp(),
  };
  const p = opts.patch;
  if (typeof p.name === "string" && p.name.trim()) {
    updates.name = p.name.trim();
    // Re-slug when the name changes, keeping uniqueness + our own slug.
    updates.slug = await uniqueSlug(
      opts.subAccountId,
      p.name,
      opts.groupId,
    );
  }
  if (typeof p.about === "string")
    updates.about = p.about.trim().slice(0, ABOUT_MAX_CHARS);
  if (typeof p.tagline === "string")
    updates.tagline = p.tagline.trim().slice(0, TAGLINE_MAX_CHARS);
  if (p.coverUrl !== undefined) updates.coverUrl = p.coverUrl;
  if (p.cardImageUrl !== undefined) updates.cardImageUrl = p.cardImageUrl;
  if (p.logoUrl !== undefined) updates.logoUrl = p.logoUrl;
  if (p.brandColor !== undefined) updates.brandColor = p.brandColor;
  if (p.joinPolicy) updates.joinPolicy = p.joinPolicy;
  if (p.status) updates.status = p.status;
  if (Array.isArray(p.categories)) {
    // Normalize: trim, drop empties, dedupe, always keep "General" first.
    const cleaned = p.categories
      .map((c) => c.trim())
      .filter((c) => c.length > 0);
    const deduped = Array.from(new Set(["General", ...cleaned]));
    updates.categories = deduped.slice(0, 10);
  }
  if (Array.isArray(p.links)) updates.links = cleanLinks(p.links);
  if (p.access) {
    updates.access = p.access;
    if (p.access === "paid") {
      if (p.priceCents !== undefined) updates.priceCents = p.priceCents;
      updates.currency = p.currency ?? snap.data()?.currency ?? "USD";
    } else {
      updates.priceCents = null;
      updates.currency = null;
    }
  }

  await ref.update(updates);
  const fresh = await ref.get();
  return { id: fresh.id, ...(fresh.data() as Omit<CommunityGroup, "id">) };
}

export async function getGroupBySlug(
  subAccountId: string,
  slug: string,
): Promise<CommunityGroup | null> {
  const snap = await getAdminDb()
    .collection(`subAccounts/${subAccountId}/communityGroups`)
    .where("slug", "==", slug)
    .limit(1)
    .get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  return { id: doc.id, ...(doc.data() as Omit<CommunityGroup, "id">) };
}

export async function getGroupById(
  subAccountId: string,
  groupId: string,
): Promise<CommunityGroup | null> {
  const snap = await getAdminDb()
    .doc(`subAccounts/${subAccountId}/communityGroups/${groupId}`)
    .get();
  if (!snap.exists) return null;
  return { id: snap.id, ...(snap.data() as Omit<CommunityGroup, "id">) };
}

export async function getMembership(
  subAccountId: string,
  groupId: string,
  memberId: string,
): Promise<GroupMembership | null> {
  const snap = await getAdminDb()
    .doc(
      `subAccounts/${subAccountId}/communityGroups/${groupId}/memberships/${memberId}`,
    )
    .get();
  if (!snap.exists) return null;
  return { id: snap.id, ...(snap.data() as Omit<GroupMembership, "id">) };
}

/**
 * Is this email a STAFF admin of the sub-account (a sub-account admin or the
 * agency owner)? Used to auto-elevate staff who join the community to
 * `moderator`. Community members aren't Firebase users, so a no-match (no
 * Firebase user for the email) cleanly means "not staff".
 */
async function isStaffEmail(
  subAccountId: string,
  email: string,
): Promise<boolean> {
  try {
    const user = await getAdminAuth().getUserByEmail(email.trim().toLowerCase());
    const db = getAdminDb();
    const saSnap = await db.doc(`subAccounts/${subAccountId}`).get();
    const agencyId = saSnap.data()?.agencyId;
    const claims = (user.customClaims ?? {}) as {
      agencyRole?: string;
      agencyId?: string;
    };
    if (claims.agencyRole === "owner" && claims.agencyId === agencyId) {
      return true;
    }
    const memberSnap = await db
      .doc(`subAccounts/${subAccountId}/subAccountMembers/${user.uid}`)
      .get();
    const m = memberSnap.data();
    return memberSnap.exists && m?.status === "active" && m?.role === "admin";
  } catch {
    // No Firebase user for that email → a regular community member.
    return false;
  }
}

export type JoinOutcome =
  | { status: "active" }
  | { status: "pending" }
  | { status: "already"; membershipStatus: GroupMembership["status"] }
  | { status: "payment_required" };

/**
 * Join a published group. Free + open → active immediately. Approval-policy →
 * pending (admin approves later). Paid groups return `payment_required` — the
 * actual one-time PayPal flow lands in Slice 6; until then a paid group can't
 * be joined here. Idempotent: an existing membership is returned as `already`.
 *
 * The membership doc id is the memberId, so a member can only hold one
 * membership per group (natural idempotency).
 */
export async function joinGroupServerSide(opts: {
  subAccountId: string;
  agencyId: string;
  groupId: string;
  memberId: string;
}): Promise<JoinOutcome> {
  const db = getAdminDb();
  const groupRef = db.doc(
    `subAccounts/${opts.subAccountId}/communityGroups/${opts.groupId}`,
  );
  const groupSnap = await groupRef.get();
  if (!groupSnap.exists) throw new Error("Group not found");
  const group = groupSnap.data() as Omit<CommunityGroup, "id">;

  const memRef = groupRef.collection("memberships").doc(opts.memberId);
  const existing = await memRef.get();
  if (existing.exists) {
    const data = existing.data() as Omit<GroupMembership, "id">;
    if (data.status !== "removed") {
      return { status: "already", membershipStatus: data.status };
    }
  }

  if (group.access === "paid") {
    // Paid join is wired in Slice 6 (one-time PayPal + admin mark-paid).
    return { status: "payment_required" };
  }

  const becomesActive = group.joinPolicy !== "approval";
  const status: GroupMembership["status"] = becomesActive
    ? "active"
    : "pending";

  // Auto-elevate staff admins to moderator so they can moderate inline.
  const memberSnap = await db
    .doc(`subAccounts/${opts.subAccountId}/members/${opts.memberId}`)
    .get();
  const email = memberSnap.data()?.email as string | undefined;
  const role: GroupMembership["role"] =
    email && (await isStaffEmail(opts.subAccountId, email))
      ? "moderator"
      : "member";

  await memRef.set({
    subAccountId: opts.subAccountId,
    agencyId: opts.agencyId,
    groupId: opts.groupId,
    memberId: opts.memberId,
    role,
    status,
    points: 0,
    level: 1,
    joinedAt: FieldValue.serverTimestamp(),
  });

  if (becomesActive) {
    await groupRef.update({ memberCount: FieldValue.increment(1) });
    void emitWebhookEvent({
      subAccountId: opts.subAccountId,
      agencyId: opts.agencyId,
      mode: "live",
      type: "community.member.joined",
      payload: { groupId: opts.groupId, memberId: opts.memberId, via: "open" },
    });
  }

  return becomesActive ? { status: "active" } : { status: "pending" };
}

/** Staff: approve a pending join request → active membership. */
export async function approveMembershipServerSide(opts: {
  subAccountId: string;
  groupId: string;
  memberId: string;
  agencyId: string;
}): Promise<void> {
  const groupRef = getAdminDb().doc(
    `subAccounts/${opts.subAccountId}/communityGroups/${opts.groupId}`,
  );
  const memRef = groupRef.collection("memberships").doc(opts.memberId);
  const snap = await memRef.get();
  if (!snap.exists || snap.data()!.status === "active") return;

  await memRef.update({ status: "active" });
  await groupRef.update({ memberCount: FieldValue.increment(1) });
  void emitWebhookEvent({
    subAccountId: opts.subAccountId,
    agencyId: opts.agencyId,
    mode: "live",
    type: "community.member.approved",
    payload: { groupId: opts.groupId, memberId: opts.memberId },
  });
}

/** Staff: promote a member to moderator (inline pin/delete rights) or demote. */
export async function setMembershipRoleServerSide(opts: {
  subAccountId: string;
  groupId: string;
  memberId: string;
  role: GroupMembership["role"];
}): Promise<void> {
  const memRef = getAdminDb().doc(
    `subAccounts/${opts.subAccountId}/communityGroups/${opts.groupId}/memberships/${opts.memberId}`,
  );
  const snap = await memRef.get();
  if (!snap.exists) return;
  await memRef.update({ role: opts.role });
}

/** Staff/moderator: set a membership status (remove / ban / restore to active),
 *  keeping the group's active member count correct. */
export async function setMembershipStatusServerSide(opts: {
  subAccountId: string;
  groupId: string;
  memberId: string;
  status: "removed" | "banned" | "active";
}): Promise<void> {
  const groupRef = getAdminDb().doc(
    `subAccounts/${opts.subAccountId}/communityGroups/${opts.groupId}`,
  );
  const memRef = groupRef.collection("memberships").doc(opts.memberId);
  const snap = await memRef.get();
  if (!snap.exists) return;
  const wasActive = snap.data()!.status === "active";
  const willActive = opts.status === "active";
  await memRef.update({ status: opts.status });
  if (wasActive && !willActive) {
    await groupRef.update({ memberCount: FieldValue.increment(-1) });
  } else if (!wasActive && willActive) {
    await groupRef.update({ memberCount: FieldValue.increment(1) });
  }
}
