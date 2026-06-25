import "server-only";

import { NextResponse } from "next/server";
import { requireCommunityStaff } from "@/lib/community/staff-guard";
import { markPurchasePaidServerSide } from "@/lib/server/community-purchase-service";

export const dynamic = "force-dynamic";

/** Staff: mark a one-time purchase paid and grant the access it bought. */
export async function POST(
  request: Request,
  ctx: {
    params: Promise<{ id: string; groupId: string; purchaseId: string }>;
  },
) {
  const { id: subAccountId, groupId, purchaseId } = await ctx.params;
  const access = await requireCommunityStaff(request, subAccountId);
  if (access instanceof NextResponse) return access;

  try {
    await markPurchasePaidServerSide({
      subAccountId,
      groupId,
      purchaseId,
      grantedByUid: access.uid,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Couldn't mark paid" },
      { status: 400 },
    );
  }
}
