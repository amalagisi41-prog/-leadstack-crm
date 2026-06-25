import "server-only";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";

/**
 * Staff guard for Community admin routes: requires a sub-account admin AND that
 * the agency has Community enabled. Returns the access context or a NextResponse
 * to short-circuit. `access.agencyId` carries the caller's agency for writes.
 */
export async function requireCommunityStaff(
  request: Request,
  subAccountId: string,
) {
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;
  const subSnap = await getAdminDb().doc(`subAccounts/${subAccountId}`).get();
  const sub = subSnap.data();
  if (sub?.communityEnabledByAgency !== true) {
    return NextResponse.json(
      { error: "Community is disabled for this sub-account." },
      { status: 403 },
    );
  }
  return {
    ...access,
    resolvedAgencyId: (sub.agencyId as string) ?? access.agencyId ?? "",
  };
}
