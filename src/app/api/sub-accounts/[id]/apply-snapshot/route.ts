import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { applyRealEstateSnapshot } from "@/lib/snapshots/real-estate-agent";

/**
 * POST /api/sub-accounts/[id]/apply-snapshot
 *
 * Applies the real-estate agent snapshot to the sub-account:
 *   - Pipeline stage labels (New Lead → Contacted → Showing Scheduled → …)
 *   - 4 email templates + 2 SMS templates
 *   - AI agent persona pre-written for a CT realtor
 *
 * Sub-account admin only. Safe to call multiple times — all writes are
 * idempotent (stable doc ids, merge semantics on the profile doc).
 *
 * Body (optional JSON):
 *   { businessName?: string; agentName?: string }
 */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;

  let body: { businessName?: string } = {};
  try {
    body = await request.json();
  } catch {
    // body is optional
  }

  const { uid: createdByUid, agencyId } = access;
  if (!agencyId) {
    return NextResponse.json({ error: "Agency not found" }, { status: 400 });
  }

  try {
    const result = await applyRealEstateSnapshot(
      subAccountId,
      agencyId,
      createdByUid,
      { businessName: body.businessName },
    );

    return NextResponse.json({
      ok: true,
      message: `Snapshot applied — ${result.templatesWritten} templates created.`,
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
