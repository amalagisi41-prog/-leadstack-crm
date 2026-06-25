import "server-only";

import { Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import type { GroupMembership, Member } from "@/types/community";

/**
 * Leaderboard + members directory reads (Admin SDK, server-rendered for
 * members). All-time ranking uses the denormalized `membership.points`; the
 * 7-day / 30-day windows aggregate the `pointEvents` time-series on read (a
 * QStash rollup is the escalation if a group ever gets big enough to need it).
 */

export type LeaderboardWindow = "7d" | "30d" | "all";

export interface LeaderboardRow {
  rank: number;
  memberId: string;
  displayName: string;
  avatarUrl: string | null;
  level: number;
  points: number;
}

function displayNameFor(m: Pick<Member, "displayName" | "email">): string {
  if (m.displayName && m.displayName.trim()) return m.displayName.trim();
  return m.email.split("@")[0] || "Member";
}

async function activeMemberships(
  saId: string,
  groupId: string,
): Promise<GroupMembership[]> {
  const snap = await getAdminDb()
    .collection(`subAccounts/${saId}/communityGroups/${groupId}/memberships`)
    .get();
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<GroupMembership, "id">) }))
    .filter((m) => m.status === "active");
}

async function hydrateMembers(
  saId: string,
  memberIds: string[],
): Promise<Map<string, { displayName: string; avatarUrl: string | null }>> {
  const db = getAdminDb();
  const unique = Array.from(new Set(memberIds));
  const out = new Map<string, { displayName: string; avatarUrl: string | null }>();
  if (unique.length === 0) return out;
  const snaps = await db.getAll(
    ...unique.map((id) => db.doc(`subAccounts/${saId}/members/${id}`)),
  );
  unique.forEach((id, i) => {
    const m = snaps[i].data() as Member | undefined;
    out.set(id, {
      displayName: m ? displayNameFor(m) : "Former member",
      avatarUrl: m?.avatarUrl ?? null,
    });
  });
  return out;
}

export async function getLeaderboard(opts: {
  subAccountId: string;
  groupId: string;
  window: LeaderboardWindow;
  limit?: number;
}): Promise<LeaderboardRow[]> {
  const limit = opts.limit ?? 50;
  const memberships = await activeMemberships(opts.subAccountId, opts.groupId);
  const levelByMember = new Map(memberships.map((m) => [m.memberId, m.level]));

  let scored: { memberId: string; points: number }[];

  if (opts.window === "all") {
    scored = memberships
      .map((m) => ({ memberId: m.memberId, points: m.points ?? 0 }))
      .filter((s) => s.points > 0);
  } else {
    const days = opts.window === "7d" ? 7 : 30;
    const cutoff = Timestamp.fromMillis(Date.now() - days * 24 * 60 * 60 * 1000);
    const snap = await getAdminDb()
      .collection(
        `subAccounts/${opts.subAccountId}/communityGroups/${opts.groupId}/pointEvents`,
      )
      .where("createdAt", ">=", cutoff)
      .get();
    const tally = new Map<string, number>();
    snap.docs.forEach((d) => {
      const { memberId, delta } = d.data() as { memberId: string; delta: number };
      tally.set(memberId, (tally.get(memberId) ?? 0) + (delta ?? 0));
    });
    scored = Array.from(tally.entries())
      .map(([memberId, points]) => ({ memberId, points }))
      .filter((s) => s.points > 0);
  }

  scored.sort((a, b) => b.points - a.points);
  const top = scored.slice(0, limit);
  const names = await hydrateMembers(
    opts.subAccountId,
    top.map((s) => s.memberId),
  );

  return top.map((s, i) => ({
    rank: i + 1,
    memberId: s.memberId,
    displayName: names.get(s.memberId)?.displayName ?? "Member",
    avatarUrl: names.get(s.memberId)?.avatarUrl ?? null,
    level: levelByMember.get(s.memberId) ?? 1,
    points: s.points,
  }));
}

export interface MemberDirectoryRow {
  memberId: string;
  displayName: string;
  /** @handle derived from the name + a short id suffix. */
  handle: string;
  bio: string;
  avatarUrl: string | null;
  level: number;
  points: number;
  role: GroupMembership["role"];
  status: "active" | "banned";
  joinedAtMs: number | null;
  lastSeenAtMs: number | null;
}

function toMillis(v: unknown): number | null {
  if (!v) return null;
  const m = v as {
    toMillis?: () => number;
    toDate?: () => Date;
    seconds?: number;
    _seconds?: number;
  };
  if (typeof m.toMillis === "function") return m.toMillis();
  if (typeof m.toDate === "function") return m.toDate().getTime();
  if (typeof m.seconds === "number") return m.seconds * 1000;
  if (typeof m._seconds === "number") return m._seconds * 1000;
  return null;
}

function handleFor(displayName: string, memberId: string): string {
  const slug =
    displayName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 24) || "member";
  return `@${slug}-${memberId.slice(-4)}`;
}

/**
 * The member directory: active + banned memberships, hydrated with name,
 * avatar, level, join date, and last-seen (for the online indicator). Banned
 * rows are returned too so a moderator can see + un-ban them; the page only
 * shows the Banned tab to moderators.
 */
export async function listMemberDirectory(opts: {
  subAccountId: string;
  groupId: string;
}): Promise<MemberDirectoryRow[]> {
  const db = getAdminDb();
  const snap = await db
    .collection(
      `subAccounts/${opts.subAccountId}/communityGroups/${opts.groupId}/memberships`,
    )
    .get();
  const memberships = snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<GroupMembership, "id">) }))
    .filter((m) => m.status === "active" || m.status === "banned");

  const ids = memberships.map((m) => m.memberId);
  const unique = Array.from(new Set(ids));
  const memberSnaps =
    unique.length > 0
      ? await db.getAll(
          ...unique.map((id) =>
            db.doc(`subAccounts/${opts.subAccountId}/members/${id}`),
          ),
        )
      : [];
  const memberById = new Map<string, Member | undefined>();
  unique.forEach((id, i) =>
    memberById.set(id, memberSnaps[i].data() as Member | undefined),
  );

  return memberships
    .map((m) => {
      const member = memberById.get(m.memberId);
      const displayName = member ? displayNameFor(member) : "Former member";
      return {
        memberId: m.memberId,
        displayName,
        handle: handleFor(displayName, m.memberId),
        bio: member?.bio ?? "",
        avatarUrl: member?.avatarUrl ?? null,
        level: m.level ?? 1,
        points: m.points ?? 0,
        role: m.role,
        status: m.status as "active" | "banned",
        joinedAtMs: toMillis(m.joinedAt),
        lastSeenAtMs: toMillis(member?.lastSeenAt),
      };
    })
    .sort((a, b) => b.points - a.points);
}
