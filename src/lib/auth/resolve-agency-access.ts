import "server-only";

import { getAdminDb } from "@/lib/firebase/admin";
import type { AgencyRole, MemberStatus } from "@/types";

export interface ResolvedAgencyAccess {
  status: MemberStatus;
  agencyId: string | null;
  agencyRole: AgencyRole | null;
  repairedPrimaryAgencyId: boolean;
}

function cleanId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function coerceAgencyRole(value: unknown): AgencyRole | null {
  return value === "owner" || value === "staff" ? value : null;
}

/**
 * Resolve the user's home agency from the canonical user doc, then recover it
 * from the denormalized membership index if that pointer went stale or missing.
 *
 * The agency page uses this to self-heal browser sessions that still have a
 * valid signed-in user but lost the agency link in claims / user profile state.
 */
export async function resolveAgencyAccess(uid: string, db = getAdminDb()) {
  const userRef = db.doc(`users/${uid}`);
  const userSnap = await userRef.get();

  if (!userSnap.exists) {
    return null;
  }

  const user = userSnap.data() ?? {};
  const status: MemberStatus = user.status === "removed" ? "removed" : "active";

  let agencyId = cleanId(user.primaryAgencyId);
  let agencyRole: AgencyRole | null = null;
  let repairedPrimaryAgencyId = false;
  let fallbackAgencyRole: AgencyRole | null = null;

  if (!agencyId) {
    const membershipSnap = await db.collection(`userMemberships/${uid}/agencies`).get();
    if (!membershipSnap.empty) {
      const memberships = membershipSnap.docs.map((doc) => {
        const data = doc.data() ?? {};
        return {
          agencyId: cleanId(data.agencyId) ?? cleanId(doc.id),
          role: coerceAgencyRole(data.role),
          name: typeof data.name === "string" ? data.name : "",
        };
      });

      const preferredMembership =
        memberships.find((membership) => membership.role === "owner") ??
        memberships.find((membership) => Boolean(membership.agencyId)) ??
        null;

      if (preferredMembership?.agencyId) {
        agencyId = preferredMembership.agencyId;
        fallbackAgencyRole = preferredMembership.role;
        await userRef.set({ primaryAgencyId: agencyId }, { merge: true });
        repairedPrimaryAgencyId = true;
      }
    }
  }

  if (agencyId) {
    const agencyMemberSnap = await db
      .doc(`agencies/${agencyId}/agencyMembers/${uid}`)
      .get();

    if (agencyMemberSnap.exists) {
      agencyRole = coerceAgencyRole(agencyMemberSnap.data()?.role);
    }

    if (!agencyRole) {
      agencyRole = fallbackAgencyRole;
    }
  }

  return {
    status,
    agencyId,
    agencyRole,
    repairedPrimaryAgencyId,
  } satisfies ResolvedAgencyAccess;
}
