import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";

/**
 * Sub-account-level member management.
 *
 * PATCH — change role (admin <-> collaborator). Caller must be agency
 *   owner or sub-account admin.
 * DELETE — remove a member from the sub-account. Sets the membership doc's
 *   status to "removed", deletes the user's switcher index entry, and (if
 *   the user has zero remaining active memberships) flips their global
 *   user.status to "removed" and disables the Firebase Auth user. The
 *   AuthContext force-signs-out on the next page load.
 */
export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string; uid: string }> },
) {
  const { id: subAccountId, uid: targetUid } = await ctx.params;
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;

  let body: {
    role?: "admin" | "collaborator";
    assignedTerritoryIds?: string[];
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const db = getAdminDb();
  const memberRef = db.doc(
    `subAccounts/${subAccountId}/subAccountMembers/${targetUid}`,
  );
  const memberSnap = await memberRef.get();
  if (!memberSnap.exists) {
    return NextResponse.json({ error: "Not a member" }, { status: 404 });
  }

  const indexRef = db.doc(
    `userMemberships/${targetUid}/subAccounts/${subAccountId}`,
  );

  const memberPatch: Record<string, unknown> = {};
  const indexPatch: Record<string, unknown> = {};

  if (body.role === "admin" || body.role === "collaborator") {
    memberPatch.role = body.role;
    indexPatch.role = body.role;
  }

  if (Array.isArray(body.assignedTerritoryIds)) {
    // Dedupe + cap at 30 — Firestore's `in` operator (used by the
    // scoped list queries) maxes out at 30 values, so assigning more
    // would silently hide the overflow territories' records from the
    // rep. 30 states/regions per rep is already well beyond realistic.
    const ids = [...new Set(body.assignedTerritoryIds.filter((x) => typeof x === "string"))];
    if (ids.length > 30) {
      return NextResponse.json(
        {
          error:
            "A member can be assigned at most 30 territories (query limit). Split coverage across reps if you need more.",
        },
        { status: 400 },
      );
    }
    if (ids.length > 0) {
      const refs = ids.map((id) =>
        db.doc(`subAccounts/${subAccountId}/territories/${id}`),
      );
      const snaps = await db.getAll(...refs);
      const missing = snaps.find(
        (s) =>
          !s.exists ||
          (s.data()?.status as string | undefined) !== "active",
      );
      if (missing) {
        return NextResponse.json(
          {
            error:
              "One or more territories don't exist or are archived. Refresh and try again.",
          },
          { status: 400 },
        );
      }
    }
    memberPatch.assignedTerritoryIds = ids;
  }

  if (Object.keys(memberPatch).length === 0) {
    return NextResponse.json(
      { error: "Nothing to update." },
      { status: 400 },
    );
  }

  const batch = db.batch();
  batch.update(memberRef, memberPatch);
  if (Object.keys(indexPatch).length > 0) {
    batch.update(indexRef, indexPatch);
  }
  await batch.commit();

  return NextResponse.json({
    ok: true,
    uid: targetUid,
    role: memberPatch.role,
    assignedTerritoryIds: memberPatch.assignedTerritoryIds,
  });
}

export async function DELETE(
  request: Request,
  ctx: { params: Promise<{ id: string; uid: string }> },
) {
  const { id: subAccountId, uid: targetUid } = await ctx.params;
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;

  if (targetUid === access.uid) {
    return NextResponse.json(
      { error: "You can't remove yourself. Ask the agency owner." },
      { status: 400 },
    );
  }

  const db = getAdminDb();
  const memberRef = db.doc(
    `subAccounts/${subAccountId}/subAccountMembers/${targetUid}`,
  );
  const memberSnap = await memberRef.get();
  if (!memberSnap.exists) {
    return NextResponse.json({ error: "Not a member" }, { status: 404 });
  }

  // 1. Flip the membership row to "removed" and drop the index entry.
  const batch = db.batch();
  batch.update(memberRef, {
    status: "removed",
    removedAt: FieldValue.serverTimestamp(),
  });
  batch.delete(
    db.doc(`userMemberships/${targetUid}/subAccounts/${subAccountId}`),
  );
  await batch.commit();

  // 2. If the user has no remaining active memberships AND no agency role,
  //    disable them globally.
  const remaining = await db
    .collectionGroup("subAccountMembers")
    .where("uid", "==", targetUid)
    .where("status", "==", "active")
    .limit(1)
    .get();

  let globallyRemoved = false;
  if (remaining.empty) {
    const userSnap = await db.doc(`users/${targetUid}`).get();
    const userData = userSnap.data() ?? {};
    const agencyId = userData.primaryAgencyId as string | null | undefined;

    let isAgencyOwner = false;
    if (agencyId) {
      const ownerSnap = await db
        .doc(`agencies/${agencyId}/agencyMembers/${targetUid}`)
        .get();
      const ownerData = ownerSnap.data() ?? {};
      isAgencyOwner = ownerData.role === "owner" && ownerData.status === "active";
    }

    if (!isAgencyOwner) {
      globallyRemoved = true;
      await db.doc(`users/${targetUid}`).update({
        status: "removed",
        updatedAt: FieldValue.serverTimestamp(),
      });
      const auth = getAdminAuth();
      const existing = await auth.getUser(targetUid).catch(() => null);
      const claims = (existing?.customClaims ?? {}) as Record<string, unknown>;
      await auth.setCustomUserClaims(targetUid, {
        ...claims,
        status: "removed",
      });
      await auth.updateUser(targetUid, { disabled: true }).catch(() => undefined);
    }
  }

  return NextResponse.json({ ok: true, uid: targetUid, globallyRemoved });
}
