import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { sanitizeProductPayload } from "@/app/api/sub-accounts/[id]/products/route";

export const dynamic = "force-dynamic";

/**
 * PATCH / DELETE for a single product. Both require the caller to be a
 * member of the product's owning sub-account.
 *
 * PATCH  — partial update of any sanitizable field (name, description,
 *          unitPriceCents, currency, active).
 * DELETE — soft delete: flips `active` to false. Historical line items
 *          that snapshotted this product are unaffected. Pass
 *          `?hard=true` for an actual delete (rarely needed; only safe
 *          when no quotes reference the product).
 */

async function loadProductAndAuth(
  request: Request,
  subAccountId: string,
  productId: string,
) {
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return { error: access };

  const db = getAdminDb();
  const snap = await db.doc(`products/${productId}`).get();
  if (!snap.exists) {
    return {
      error: NextResponse.json({ error: "Product not found" }, { status: 404 }),
    };
  }
  const data = snap.data() ?? {};
  if (data.subAccountId !== subAccountId) {
    return {
      error: NextResponse.json(
        { error: "Product belongs to a different sub-account" },
        { status: 403 },
      ),
    };
  }
  return { access, db, ref: snap.ref };
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; productId: string }> },
) {
  const { id: subAccountId, productId } = await params;
  const loaded = await loadProductAndAuth(request, subAccountId, productId);
  if ("error" in loaded) return loaded.error;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const updates = sanitizeProductPayload(body);
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
    console.error("[products/update] write failed", err);
    return NextResponse.json(
      { error: "Failed to update product" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; productId: string }> },
) {
  const { id: subAccountId, productId } = await params;
  const url = new URL(request.url);
  const hard = url.searchParams.get("hard") === "true";

  const loaded = await loadProductAndAuth(request, subAccountId, productId);
  if ("error" in loaded) return loaded.error;

  try {
    if (hard) {
      await loaded.ref.delete();
    } else {
      await loaded.ref.update({
        active: false,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
  } catch (err) {
    console.error("[products/delete] failed", err);
    return NextResponse.json(
      { error: "Failed to delete product" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
