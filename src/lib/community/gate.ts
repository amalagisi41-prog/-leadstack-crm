import "server-only";

import { getAdminDb } from "@/lib/firebase/admin";

/**
 * Agency-level gate for the Community feature, mirroring the
 * Broadcasts/Website/Social Planner pattern. Read `communityEnabledByAgency`
 * with strict `=== true` so legacy/undefined docs stay locked.
 *
 * This guard MUST wrap every community API route AND every public `/c/*` page —
 * not just the dashboard sidebar. A disabled (or hidden) sub-account's group
 * must be unreachable by direct URL, so pages call this and `notFound()` while
 * routes 403/404 when `enabled` is false.
 */
export interface CommunityGate {
  subAccountId: string;
  agencyId: string;
  ownerUid: string;
  enabled: boolean;
}

export async function getCommunityGate(
  subAccountId: string,
): Promise<CommunityGate | null> {
  const snap = await getAdminDb().doc(`subAccounts/${subAccountId}`).get();
  if (!snap.exists) return null;
  const data = snap.data()!;
  return {
    subAccountId,
    agencyId: (data.agencyId as string) ?? "",
    ownerUid: (data.createdByUid as string) ?? "",
    enabled: data.communityEnabledByAgency === true,
  };
}
