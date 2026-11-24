import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { getAdminDb } from "@/lib/firebase/admin";
import {
  serializeListingsImportSource,
  sourcesCollection,
  syncListingsFromSource,
} from "@/lib/marketing/listings-source-sync";

export const dynamic = "force-dynamic";

/** Manual "Sync now" for one already-connected listings page. */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string; sourceId: string }> },
) {
  const { id, sourceId } = await ctx.params;
  const auth = await requireSubAccountAdmin(request, id);
  if (auth instanceof NextResponse) return auth;

  const ref = getAdminDb().doc(`${sourcesCollection(id)}/${sourceId}`);
  const snap = await ref.get();
  if (!snap.exists) {
    return NextResponse.json(
      { error: "That listings page is not connected." },
      { status: 409 },
    );
  }

  const result = await syncListingsFromSource(id, sourceId);
  const refreshed = await ref.get();
  return NextResponse.json(
    {
      ok: result.ok,
      propertyCount: result.propertyCount,
      error: result.error,
      source: serializeListingsImportSource(sourceId, refreshed.data()),
    },
    { status: result.ok ? 200 : 502 },
  );
}
