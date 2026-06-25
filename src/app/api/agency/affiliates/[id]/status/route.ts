import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { LANDING_VARIANT } from "@/config/landing";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAgencyOwner } from "@/lib/auth/require-agency-owner";
import type { AffiliateStatus } from "@/types/affiliate";

export const dynamic = "force-dynamic";

const VALID_STATUSES: AffiliateStatus[] = ["active", "paused", "banned"];

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  if (LANDING_VARIANT !== "leadstack") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const authed = await requireAgencyOwner(request);
  if (authed instanceof NextResponse) return authed;

  const { id } = await ctx.params;
  let body: { status?: string };
  try {
    body = (await request.json()) as { status?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const nextStatus = body.status;
  if (
    typeof nextStatus !== "string" ||
    !VALID_STATUSES.includes(nextStatus as AffiliateStatus)
  ) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  await getAdminDb()
    .collection("affiliates")
    .doc(id)
    .update({
      status: nextStatus,
      updatedAt: FieldValue.serverTimestamp(),
    });

  return NextResponse.json({ ok: true, status: nextStatus });
}
