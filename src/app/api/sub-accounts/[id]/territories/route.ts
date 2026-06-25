import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";

/**
 * Territory CRUD for the opt-in territory-scoping feature.
 *
 * POST creates an active territory on the named sub-account. Caller
 * must be sub-account admin (or agency owner). Name is unique per
 * sub-account, case-insensitive.
 *
 * Reads happen over the client SDK against
 *   subAccounts/{saId}/territories
 * gated by firestore.rules; this route only handles writes.
 */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;

  let body: { name?: string; code?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const name = (body.name ?? "").trim();
  if (name.length < 1 || name.length > 60) {
    return NextResponse.json(
      { error: "Territory name must be 1–60 characters." },
      { status: 400 },
    );
  }
  const code =
    typeof body.code === "string" && body.code.trim().length > 0
      ? body.code.trim().slice(0, 12)
      : null;

  const db = getAdminDb();
  const subSnap = await db.doc(`subAccounts/${subAccountId}`).get();
  if (!subSnap.exists) {
    return NextResponse.json(
      { error: "Sub-account not found" },
      { status: 404 },
    );
  }
  const agencyId = (subSnap.data()?.agencyId as string | undefined) ?? null;
  if (!agencyId) {
    return NextResponse.json(
      { error: "Sub-account is missing tenancy metadata." },
      { status: 500 },
    );
  }

  // Uniqueness check (case-insensitive). Cheap collection-scan via the
  // existing index — territory lists are tiny by design.
  const existing = await db
    .collection(`subAccounts/${subAccountId}/territories`)
    .get();
  const lower = name.toLowerCase();
  const dup = existing.docs.find(
    (d) => ((d.data().name as string | undefined) ?? "").toLowerCase() === lower,
  );
  if (dup) {
    return NextResponse.json(
      { error: `A territory named "${name}" already exists.` },
      { status: 409 },
    );
  }

  const ref = db
    .collection(`subAccounts/${subAccountId}/territories`)
    .doc();
  await ref.set({
    id: ref.id,
    subAccountId,
    agencyId,
    name,
    code,
    status: "active",
    createdByUid: access.uid,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return NextResponse.json({ ok: true, id: ref.id, name, code });
}
