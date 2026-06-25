import "server-only";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { GLOBAL_TERRITORY_ID } from "@/types";

interface SubAccountAccessLike {
  uid: string;
  subAccountId: string;
  subAccountRole: "admin" | "collaborator" | "agencyOwner";
}

export interface EffectiveTerritoryScope {
  /**
   * True only when the caller is a collaborator AND the sub-account
   * has territory scoping enabled. Admins / agency owners are never
   * scoped.
   */
  enforce: boolean;
  /**
   * The caller's assigned territories — only populated when
   * `enforce === true`. Apply as a filter when fetching deals /
   * contacts from server routes.
   */
  ids: string[] | null;
}

/**
 * Server-side helper. Mirrors the client `useEffectiveTerritoryFilter`
 * hook: returns whether the caller is subject to territory scoping in
 * this sub-account, and if so, which territory ids they may see.
 *
 * Cost: 1 admin-SDK get on the sub-account doc + 1 on the member doc
 * (skipped entirely for agency owners + when the toggle is off).
 */
export async function loadEffectiveTerritoryScope(
  access: SubAccountAccessLike,
): Promise<EffectiveTerritoryScope> {
  if (
    access.subAccountRole === "admin" ||
    access.subAccountRole === "agencyOwner"
  ) {
    return { enforce: false, ids: null };
  }
  const db = getAdminDb();
  const subSnap = await db.doc(`subAccounts/${access.subAccountId}`).get();
  const enabled = subSnap.data()?.territoryScopingEnabled === true;
  if (!enabled) return { enforce: false, ids: null };

  const memberSnap = await db
    .doc(
      `subAccounts/${access.subAccountId}/subAccountMembers/${access.uid}`,
    )
    .get();
  const assigned =
    (memberSnap.data()?.assignedTerritoryIds as string[] | undefined) ??
    [];
  // Global is the shared pool — visible to every collaborator on top of
  // their assigned territories (mirrors the rules' `territoryId == "global"`
  // clause + the client hook's withGlobal()). Prepend + dedupe.
  const ids = [
    GLOBAL_TERRITORY_ID,
    ...assigned.filter((id) => id !== GLOBAL_TERRITORY_ID),
  ];
  return { enforce: true, ids };
}

function denied(): NextResponse {
  return NextResponse.json(
    { error: "This record isn't in one of your assigned territories." },
    { status: 403 },
  );
}

/**
 * Route-level territory gate. Returns a 403 `NextResponse` when the
 * caller is a scoped collaborator and `territoryId` isn't one of theirs,
 * otherwise `null` (allowed). Admins / agency owners / scoping-off
 * always pass. Use when you already hold the doc's territory id.
 *
 *   const gate = await territoryGate(access, contact.territoryId);
 *   if (gate) return gate;
 */
export async function territoryGate(
  access: SubAccountAccessLike,
  territoryId: string | null | undefined,
): Promise<NextResponse | null> {
  const scope = await loadEffectiveTerritoryScope(access);
  if (!scope.enforce) return null;
  if (!territoryId || !(scope.ids ?? []).includes(territoryId)) {
    return denied();
  }
  return null;
}

/**
 * Like {@link territoryGate} but loads the contact to read its
 * `territoryId`. Use when you only hold a `contactId` (e.g. quote
 * routes that act on a quote's linked contact). Mirrors the
 * `canReadInheritedFromContact` rule for tasks/quotes/events.
 */
export async function territoryGateForContact(
  access: SubAccountAccessLike,
  contactId: string | null | undefined,
): Promise<NextResponse | null> {
  const scope = await loadEffectiveTerritoryScope(access);
  if (!scope.enforce) return null;
  if (!contactId) return denied();
  const snap = await getAdminDb().doc(`contacts/${contactId}`).get();
  const territoryId =
    (snap.data()?.territoryId as string | null | undefined) ?? null;
  if (!territoryId || !(scope.ids ?? []).includes(territoryId)) {
    return denied();
  }
  return null;
}
