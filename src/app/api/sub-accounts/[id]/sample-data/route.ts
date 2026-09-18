import "server-only";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { removeSampleWorkspace } from "@/lib/seed/sample-workspace";

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
