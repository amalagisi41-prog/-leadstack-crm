import "server-only";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import {
  removeSampleWorkspace,
  seedSampleWorkspace,
} from "@/lib/seed/sample-workspace";
import type { SubAccountDoc } from "@/types/tenancy";

/**
 * POST /api/sub-accounts/[id]/sample-data
 *
 * Puts the worked example into a workspace that doesn't have one.
 *
 * Two workspaces need this. The obvious one is a workspace whose example was
 * removed and whose owner wants it back. The one that actually forced it:
 * seeding runs at CREATION, so every workspace made before the seeder existed
 * can never receive the example at all. The product tells a new user their
 * workspace opens to something legible, and those workspaces are silently
 * exempt from that promise with no way to opt in.
 *
 * Refuses when the workspace already holds sample records, rather than
 * seeding a second set — a duplicate example is worse than none, because now
 * the fictional rows outnumber the explanation of them.
 */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const access = await requireSubAccountAdmin(request, id);
  if (access instanceof NextResponse) return access;

  const db = getAdminDb();
  const snap = await db.doc(`subAccounts/${id}`).get();
  if (!snap.exists) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }
  // The workspace document is the authority on its agency, not the caller's
  // claim — an agency owner's claim would be right here, but a sub-account
  // admin's need not be, and the tenancy key has to match the workspace.
  const agencyId = (snap.data() as SubAccountDoc)?.agencyId;
  if (!agencyId) {
    return NextResponse.json(
      { error: "This workspace is missing its agency link." },
      { status: 409 }
    );
  }

  try {
    const existing = await db
      .collection("contacts")
      .where("subAccountId", "==", id)
      .where("isSample", "==", true)
      .limit(1)
      .get();
    if (!existing.empty) {
      return NextResponse.json(
        { error: "This workspace already has the example in it." },
        { status: 409 }
      );
    }

    const seeded = await seedSampleWorkspace(db, {
      subAccountId: id,
      agencyId,
      createdByUid: access.uid,
    });
    return NextResponse.json({ ok: true, seeded });
  } catch (err) {
    console.error("[sample-data] seed failed", id, err);
    return NextResponse.json(
      { error: "Could not add the example. Try again in a moment." },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/sub-accounts/[id]/sample-data
 *
 * Clears the worked example a workspace was seeded with. Without this the
 * example could only ever be removed record by record, which for a client who
 * has started working for real means picking their own contacts out of a list
 * of fictional ones — so it would simply stay there forever.
 *
 * Deletes only documents carrying the sample marker, so everything the client
 * made themselves survives. Admin-only: this destroys records, and a
 * collaborator should not be able to.
 */
export async function DELETE(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const access = await requireSubAccountAdmin(request, id);
  if (access instanceof NextResponse) return access;

  try {
    const removed = await removeSampleWorkspace(getAdminDb(), id);
    return NextResponse.json({ ok: true, removed });
  } catch (err) {
    console.error("[sample-data] remove failed", id, err);
    return NextResponse.json(
      { error: "Could not remove the sample data. Try again in a moment." },
      { status: 500 }
    );
  }
}
