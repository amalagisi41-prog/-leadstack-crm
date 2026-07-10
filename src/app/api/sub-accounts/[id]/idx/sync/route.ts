import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { syncIdxListings } from "@/lib/idx/sync";

/**
 * Manual "Sync now" — lets the operator pull listings on demand instead of
 * waiting for the scheduled 6-hour job. Runs the exact same sync logic the
 * QStash step worker uses (`syncIdxListings`).
 */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const result = await syncIdxListings(subAccountId);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error ?? "Sync failed." },
      { status: 400 },
    );
  }
  return NextResponse.json({ ok: true, listingCount: result.listingCount });
}
