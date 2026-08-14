import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { getAdminDb } from "@/lib/firebase/admin";

function iso(value: unknown): string | null {
  if (value && typeof value === "object" && "toDate" in value) {
    return (value as { toDate(): Date }).toDate().toISOString();
  }
  return null;
}

export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const access = await requireSubAccountAdmin(request, id);
  if (access instanceof NextResponse) return access;

  const snapshot = await getAdminDb()
    .collection(`subAccounts/${id}/websiteSnapshotLibrary`)
    .orderBy("createdAt", "desc")
    .limit(25)
    .get();
  return NextResponse.json({
    snapshots: snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        sourceUrl: String(data.sourceUrl ?? ""),
        title: String(data.title ?? "Website snapshot"),
        pageCount: Number(data.pageCount ?? 0),
        status: String(data.status ?? "ready"),
        createdAt: iso(data.createdAt),
      };
    }),
  });
}
