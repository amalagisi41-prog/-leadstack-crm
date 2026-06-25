import "server-only";

import { getCommunityGate, type CommunityGate } from "@/lib/community/gate";
import { getCurrentMember } from "@/lib/community/member-session";
import {
  getGroupById,
  getGroupBySlug,
  getMembership,
} from "@/lib/server/community-service";
import type {
  CommunityGroup,
  GroupMembership,
  Member,
} from "@/types/community";

export interface GroupAccessOk {
  kind: "ok";
  gate: CommunityGate;
  member: Member;
  group: CommunityGroup;
  membership: GroupMembership;
}

export type GroupPageAccess =
  | GroupAccessOk
  | { kind: "notFound" }
  | { kind: "redirect"; to: string };

/**
 * Resolve member access to a group's gated surfaces (feed, classroom) by slug,
 * for server components. Returns:
 *  - `notFound` when the gate is off or the group isn't published
 *  - `redirect` to login (no session) or to the About page (signed in but not
 *    an active member — they need to join first)
 *  - `ok` with the full context when the viewer is an active member
 */
export async function requireGroupPageAccess(
  saId: string,
  groupSlug: string,
): Promise<GroupPageAccess> {
  const gate = await getCommunityGate(saId);
  if (!gate || !gate.enabled) return { kind: "notFound" };

  const group = await getGroupBySlug(saId, groupSlug);
  if (!group || group.status !== "published") return { kind: "notFound" };

  const member = await getCurrentMember(saId);
  if (!member) {
    return {
      kind: "redirect",
      to: `/c/${saId}/login?next=${encodeURIComponent(`/c/${saId}/${groupSlug}`)}`,
    };
  }

  const membership = await getMembership(saId, group.id, member.id);
  if (!membership || membership.status !== "active") {
    // Signed in but hasn't joined (or pending/removed) — send to the About
    // page where the Join CTA lives.
    return { kind: "redirect", to: `/c/${saId}/${groupSlug}` };
  }

  return { kind: "ok", gate, member, group, membership };
}

/** Sub-account-level member access (not group-scoped) — for DMs/profile. */
export type MemberApiAccess =
  | { kind: "ok"; gate: CommunityGate; member: Member }
  | { kind: "error"; status: number; message: string };

export async function requireMemberApi(
  saId: string,
): Promise<MemberApiAccess> {
  const gate = await getCommunityGate(saId);
  if (!gate || !gate.enabled) {
    return { kind: "error", status: 404, message: "Not found" };
  }
  const member = await getCurrentMember(saId);
  if (!member) {
    return { kind: "error", status: 401, message: "Sign in first" };
  }
  return { kind: "ok", gate, member };
}

export type GroupApiAccess =
  | GroupAccessOk
  | { kind: "error"; status: number; message: string };

/**
 * Same access check for member mutation routes, keyed by groupId (the client
 * already knows it). Returns a structured error instead of a redirect.
 */
export async function requireGroupApiAccess(
  saId: string,
  groupId: string,
): Promise<GroupApiAccess> {
  const gate = await getCommunityGate(saId);
  if (!gate || !gate.enabled) {
    return { kind: "error", status: 404, message: "Not found" };
  }
  const member = await getCurrentMember(saId);
  if (!member) {
    return { kind: "error", status: 401, message: "Sign in first" };
  }
  const group = await getGroupById(saId, groupId);
  if (!group || group.status !== "published") {
    return { kind: "error", status: 404, message: "Group not found" };
  }
  const membership = await getMembership(saId, groupId, member.id);
  if (!membership || membership.status !== "active") {
    return { kind: "error", status: 403, message: "Join the group first" };
  }
  return { kind: "ok", gate, member, group, membership };
}
