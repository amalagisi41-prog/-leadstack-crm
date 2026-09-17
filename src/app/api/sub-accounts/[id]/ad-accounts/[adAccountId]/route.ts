import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { sanitizeAdAccountPayload } from "@/lib/ad-accounts/sanitize";

export const dynamic = "force-dynamic";

/**
 * PATCH / DELETE for a single ad account row. Both require the caller to be
 * an admin (or the agency owner) of the row's owning sub-account — this is
 * billing data, not general catalog data, so it's tighter than Products.
 *
 * PATCH  — partial update of any sanitizable field.
 * DELETE — hard delete. Unlike Products there's no historical document that
 *          snapshots an ad account's values, so there's nothing an archive
 *          would protect.
 */

async function loadAdAccountAndAuth(
  request: Request,
  subAccountId: string,
  adAccountId: string,
) {
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return { error: access };

  const db = getAdminDb();
  const snap = await db.doc(`adAccounts/${adAccountId}`).get();
  if (!snap.exists) {
    return {
      error: NextResponse.json(
        { error: "Ad account not found" },
        { status: 404 },
      ),
    };
  }
  const data = snap.data() ?? {};
  if (data.subAccountId !== subAccountId) {
    return {
      error: NextResponse.json(
        { error: "Ad account belongs to a different sub-account" },
        { status: 403 },
      ),
    };
  }
  return { access, db, ref: snap.ref };
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; adAccountId: string }> },
) {
  const { id: subAccountId, adAccountId } = await params;
  const loaded = await loadAdAccountAndAuth(request, subAccountId, adAccountId);
  if ("error" in loaded) return loaded.error;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const updates = sanitizeAdAccountPayload(body);
  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { error: "No valid fields to update" },
      { status: 400 },
    );
  }

  try {
    await loaded.ref.update({
      ...updates,
      updatedAt: FieldValue.serverTimestamp(),
    });
  } catch (err) {
    console.error("[ad-accounts/update] write failed", err);
    return NextResponse.json(
      { error: "Failed to update ad account" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; adAccountId: string }> },
) {
  const { id: subAccountId, adAccountId } = await params;
  const loaded = await loadAdAccountAndAuth(request, subAccountId, adAccountId);
  if ("error" in loaded) return loaded.error;

  try {
    await loaded.ref.delete();
  } catch (err) {
    console.error("[ad-accounts/delete] failed", err);
    return NextResponse.json(
      { error: "Failed to delete ad account" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
