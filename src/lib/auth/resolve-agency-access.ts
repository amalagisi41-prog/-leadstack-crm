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
 * A role only counts when the row it came from is still active.
 *
 * Removing a member does NOT delete their row — it sets `status: "removed"`
 * (see /api/sub-accounts/[id]/members/[uid]). Reading `.role` without checking
 * `.status` therefore treats a removed agency owner as a current one, and the
 * value returned here is minted straight into the `agencyRole` custom claim by
 * /api/auth/refresh-claims. That claim is what `requireAgencyOwner()` and the
 * `isAgencyOwner()` Firestore rule trust — so a removed owner regained full
 * agency control simply by signing in again.
 *
 * Rows written before `status` existed are treated as active, matching how the
 * rest of the codebase reads legacy membership rows.
 */
function activeAgencyRole(data: Record<string, unknown> | undefined): AgencyRole | null {
  if (!data) return null;
  if (data.status !== undefined && data.status !== "active") return null;
  return coerceAgencyRole(data.role);
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
          role: activeAgencyRole(data),
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
      agencyRole = activeAgencyRole(agencyMemberSnap.data());
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
