import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { getAdminDb } from "@/lib/firebase/admin";
import { sourcesCollection } from "@/lib/marketing/listings-source-sync";

export const dynamic = "force-dynamic";

/** Disconnect one listings page. Properties already synced stay in the workspace inventory (not deleted). */
export async function DELETE(
  request: Request,
  ctx: { params: Promise<{ id: string; sourceId: string }> },
) {
  const { id, sourceId } = await ctx.params;
  const auth = await requireSubAccountAdmin(request, id);
  if (auth instanceof NextResponse) return auth;

  await getAdminDb().doc(`${sourcesCollection(id)}/${sourceId}`).delete();
  return NextResponse.json({ ok: true });
}
