import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { getAdminDb } from "@/lib/firebase/admin";
import {
  serializeListingsImportSource,
  syncListingsFromSource,
} from "@/lib/marketing/listings-source-sync";

export const dynamic = "force-dynamic";

/** Manual "Sync now" for an already-connected listings page. */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const auth = await requireSubAccountAdmin(request, id);
  if (auth instanceof NextResponse) return auth;

  const snap = await getAdminDb().doc(`subAccounts/${id}/listingsImportSource/main`).get();
  if (!snap.exists) {
    return NextResponse.json(
      { error: "No listings page is connected yet." },
      { status: 409 },
    );
  }

  const result = await syncListingsFromSource(id);
  const refreshed = await getAdminDb().doc(`subAccounts/${id}/listingsImportSource/main`).get();
  return NextResponse.json(
    {
      ok: result.ok,
      propertyCount: result.propertyCount,
      error: result.error,
      source: serializeListingsImportSource(refreshed.data()),
    },
    { status: result.ok ? 200 : 502 },
  );
}
