import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { DEFAULT_PRODUCT } from "@/types/products";
import type { Product } from "@/types/products";

export const dynamic = "force-dynamic";

/**
 * POST /api/sub-accounts/[id]/products
 *
 * Create a new product in the sub-account catalog. Any active member can
 * create products (admin gate not required — a collaborator drafting an
 * invoice might need to add a missing product on the fly).
 *
 * Body shape (all optional except name + unitPriceCents):
 *   {
 *     name: string,
 *     description?: string,
 *     unitPriceCents: number,
 *     currency?: string,
 *     active?: boolean,
 *   }
 *
 * Returns: `{ id }` on success.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: subAccountId } = await params;

  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  let body: CreateProductPayload;
  try {
    body = (await request.json()) as CreateProductPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const sanitized = sanitizePayload(body);
  if (!sanitized.name) {
    return NextResponse.json(
      { error: "name is required" },
      { status: 400 },
    );
  }

  const db = getAdminDb();
  const subSnap = await db.doc(`subAccounts/${subAccountId}`).get();
  const agencyId =
    access.agencyId ?? (subSnap.data()?.agencyId as string | undefined);
  if (!agencyId) {
    return NextResponse.json(
      { error: "Sub-account is missing an agencyId" },
      { status: 500 },
    );
  }

  const docRef = db.collection("products").doc();
  const doc: Omit<Product, "id"> = {
    ...DEFAULT_PRODUCT,
    agencyId,
    subAccountId,
    createdByUid: access.uid,
    ...sanitized,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };

  try {
    await docRef.set(doc);
  } catch (err) {
    console.error("[products/create] write failed", err);
    return NextResponse.json(
      { error: "Failed to create product" },
      { status: 500 },
    );
  }

  return NextResponse.json({ id: docRef.id }, { status: 201 });
}

// ─── Helpers ─────────────────────────────────────────────────────

interface CreateProductPayload {
  name?: string;
  description?: string;
  unitPriceCents?: number;
  currency?: string;
  active?: boolean;
}

export function sanitizeProductPayload(
  body: CreateProductPayload,
): Partial<Product> {
  return sanitizePayload(body);
}

function sanitizePayload(body: CreateProductPayload): Partial<Product> {
  const out: Partial<Product> = {};

  if (typeof body.name === "string") {
    out.name = body.name.trim().slice(0, 200);
  }
  if (typeof body.description === "string") {
    out.description = body.description.trim().slice(0, 2_000);
  }
  if (typeof body.unitPriceCents === "number" && Number.isFinite(body.unitPriceCents)) {
    out.unitPriceCents = Math.max(0, Math.round(body.unitPriceCents));
  }
  if (typeof body.currency === "string" && body.currency.trim()) {
    out.currency = body.currency.trim().toUpperCase().slice(0, 3);
  }
  if (typeof body.active === "boolean") {
    out.active = body.active;
  }

  return out;
}
