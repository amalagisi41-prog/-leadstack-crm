import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { getAdminDb } from "@/lib/firebase/admin";

export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const access = await requireSubAccountAdmin(request, id);
  if (access instanceof NextResponse) return access;
  const url = new URL(request.url);
  const index = Math.max(0, Number(url.searchParams.get("page") ?? 0));
  const snap = await getAdminDb()
    .doc(`subAccounts/${id}/websiteTransfers/current`)
    .get();
  const page = snap.data()?.pages?.[index] as
    | { snapshotHtml?: string }
    | undefined;
  if (!page?.snapshotHtml)
    return new NextResponse("Preview unavailable for this page.", {
      status: 404,
    });
  return new NextResponse(page.snapshotHtml, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy":
        "default-src 'self' https: data:; style-src 'self' https: 'unsafe-inline'; img-src 'self' https: data:; font-src 'self' https: data:; script-src 'none'; frame-ancestors 'self'; form-action 'none';",
      "Cache-Control": "private, no-store",
    },
  });
}
