import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getCommunityGate } from "@/lib/community/gate";
import { getCurrentMember } from "@/lib/community/member-session";
import { getAdminDb } from "@/lib/firebase/admin";

export const dynamic = "force-dynamic";

export const BIO_MAX = 300;
export const NAME_MAX = 60;

/** Member: update their own display name + bio. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ saId: string }> },
) {
  const { saId } = await params;

  const gate = await getCommunityGate(saId);
  if (!gate || !gate.enabled) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const member = await getCurrentMember(saId);
  if (!member) {
    return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  }

  let body: { displayName?: string; bio?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (typeof body.displayName === "string") {
    updates.displayName = body.displayName.trim().slice(0, NAME_MAX) || null;
  }
  if (typeof body.bio === "string") {
    updates.bio = body.bio.trim().slice(0, BIO_MAX);
  }

  await getAdminDb()
    .doc(`subAccounts/${saId}/members/${member.id}`)
    .update(updates);

  return NextResponse.json({ ok: true });
}
