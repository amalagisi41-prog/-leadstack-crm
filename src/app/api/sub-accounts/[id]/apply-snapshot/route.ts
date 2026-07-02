import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { applySnapshot } from "@/lib/snapshots/apply";
import { SNAPSHOTS, type SnapshotId } from "@/lib/snapshots/catalog";

/**
 * POST /api/sub-accounts/[id]/apply-snapshot
 *
 * Applies a role snapshot (solo_agent / team_builder / broker_office) to the
 * sub-account: a tailored pipeline, email/SMS templates, an AI persona, and
 * draft workflows. Sub-account admin only. Idempotent per snapshot.
 *
 * Body: { snapshotId?: SnapshotId; businessName?: string }
 *   snapshotId defaults to "solo_agent".
 */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;

  let body: { snapshotId?: string; businessName?: string } = {};
  try {
    body = await request.json();
  } catch {
    // body is optional
  }

  const { uid: createdByUid, agencyId } = access;
  if (!agencyId) {
    return NextResponse.json({ error: "Agency not found" }, { status: 400 });
  }

  const snapshotId = (body.snapshotId ?? "solo_agent") as SnapshotId;
  if (!(snapshotId in SNAPSHOTS)) {
    return NextResponse.json({ error: "Unknown snapshot." }, { status: 400 });
  }

  try {
    const result = await applySnapshot(
      subAccountId,
      agencyId,
      createdByUid,
      snapshotId,
      { businessName: body.businessName },
    );
    return NextResponse.json({
      ok: true,
      message: `Applied "${SNAPSHOTS[snapshotId].name}" — ${result.templates} templates, ${result.workflows} workflows.`,
      ...result,
    });
  } catch (err) {
    console.error("[apply-snapshot] error", err);
    return NextResponse.json(
      { error: "Failed to apply snapshot. Check server logs." },
      { status: 500 },
    );
  }
}
