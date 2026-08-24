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
    // `config.connected` is the public marker; `config.token` is the legacy
    // inline copy on docs that have not been migrated yet. Either proves a
    // connection — reading only the marker would report every un-migrated
    // workspace as disconnected.
    connected: Boolean((config?.connected || config?.token) && config?.locationId),
    locationId: config?.locationId ?? null,
  });
}
