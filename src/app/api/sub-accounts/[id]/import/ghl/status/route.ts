import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { getAdminDb } from "@/lib/firebase/admin";
import type { GhlImportConfig } from "@/types";

export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const access = await requireSubAccountAdmin(request, id);
  if (access instanceof NextResponse) return access;

  const snap = await getAdminDb().doc(`subAccounts/${id}`).get();
  const config = snap.data()?.ghlImportConfig as GhlImportConfig | undefined;
  return NextResponse.json({
    ok: true,
    connected: Boolean(config?.token && config.locationId),
    locationId: config?.locationId ?? null,
  });
}
