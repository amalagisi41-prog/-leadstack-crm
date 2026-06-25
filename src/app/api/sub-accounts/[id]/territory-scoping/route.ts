import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { GLOBAL_TERRITORY_ID } from "@/types";

/**
 * Toggle territory scoping on a sub-account.
 *
 * Body: `{ enabled: boolean }`
 *
 * No preconditions — configuration (creating territories, assigning
 * them to members) is independent of the toggle. The settings UI
 * surfaces a warning banner when the toggle is on but territories
 * aren't set up yet so the admin notices the half-configured state.
 *
 * Disabling preserves the territory rows + assignedTerritoryIds arrays
 * so re-enabling is one click.
 */
export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;

  let body: { enabled?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const enabled = body.enabled === true;

  const db = getAdminDb();
  const subRef = db.doc(`subAccounts/${subAccountId}`);
  const subSnap = await subRef.get();
  if (!subSnap.exists) {
    return NextResponse.json(
      { error: "Sub-account not found" },
      { status: 404 },
    );
  }
  const agencyId = (subSnap.data()?.agencyId as string | undefined) ?? null;

  // On enable, seed the reserved "Global" territory + give every active
  // member who has no territories yet the Global default. This is what
  // makes turning scoping on a no-op at first: everyone's in Global, all
  // records are Global, so nothing disappears — the admin then carves
  // out real territories and moves reps off Global. Idempotent.
  if (enabled && agencyId) {
    const globalRef = db.doc(
      `subAccounts/${subAccountId}/territories/${GLOBAL_TERRITORY_ID}`,
    );
    const globalSnap = await globalRef.get();
    if (!globalSnap.exists) {
      await globalRef.set({
        id: GLOBAL_TERRITORY_ID,
        subAccountId,
        agencyId,
        name: "Global",
        code: null,
        status: "active",
        createdByUid: access.uid,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    // Backfill members with no territory assignment → Global.
    const membersSnap = await db
      .collection(`subAccounts/${subAccountId}/subAccountMembers`)
      .where("status", "==", "active")
      .get();
    const toBackfill = membersSnap.docs.filter((d) => {
      const ids = (d.data().assignedTerritoryIds as string[] | undefined) ?? [];
      return ids.length === 0;
    });
    for (let i = 0; i < toBackfill.length; i += 500) {
      const batch = db.batch();
      for (const d of toBackfill.slice(i, i + 500)) {
        batch.update(d.ref, { assignedTerritoryIds: [GLOBAL_TERRITORY_ID] });
      }
      await batch.commit();
    }

    // Backfill records that pre-date territoryId being on the schema →
    // Global. Without this, collaborators see nothing from before the
    // toggle was flipped, since the rule's canSeeScopedDoc() rejects
    // `territoryId == null` for non-admins. We can't query for "missing
    // field" directly in Firestore — fetch by sub-account and filter in
    // memory. updatedAt is intentionally NOT stamped so contacts/deals
    // lists stay sorted by their actual last-edit time, not the
    // migration sweep. Idempotent: re-enabling after a disable touches
    // only docs that still lack the field.
    const recordCollections = [
      "contacts",
      "deals",
      "tasks",
      "quotes",
      "events",
    ] as const;
    for (const col of recordCollections) {
      const snap = await db
        .collection(col)
        .where("subAccountId", "==", subAccountId)
        .get();
      const missing = snap.docs.filter((d) => !d.data().territoryId);
      for (let i = 0; i < missing.length; i += 500) {
        const batch = db.batch();
        for (const d of missing.slice(i, i + 500)) {
          batch.update(d.ref, { territoryId: GLOBAL_TERRITORY_ID });
        }
        await batch.commit();
      }
    }

    // Same backfill on the booking-pages subcollection so the
    // no-unassigned invariant covers booking-page config docs too.
    // Subcollection-scoped query keeps this cheap.
    const bookingPagesSnap = await db
      .collection(`subAccounts/${subAccountId}/bookingPages`)
      .get();
    const bookingMissing = bookingPagesSnap.docs.filter(
      (d) => !d.data().territoryId,
    );
    for (let i = 0; i < bookingMissing.length; i += 500) {
      const batch = db.batch();
      for (const d of bookingMissing.slice(i, i + 500)) {
        batch.update(d.ref, { territoryId: GLOBAL_TERRITORY_ID });
      }
      await batch.commit();
    }
  }

  await subRef.update({
    territoryScopingEnabled: enabled,
    territoryScopingEnabledAt: enabled
      ? FieldValue.serverTimestamp()
      : null,
    territoryScopingEnabledByUid: enabled ? access.uid : null,
    updatedAt: FieldValue.serverTimestamp(),
  });

  return NextResponse.json({ ok: true, enabled });
}
