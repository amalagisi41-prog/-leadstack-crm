import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { parseRprOrgId } from "@/lib/rpr/link";

/**
 * Manage the per-sub-account RPR (Realtors Property Resource) MLS-SSO board
 * code — e.g. "ctconnm-n" for SmartMLS/connectMLS in Connecticut. Powers the
 * "View on RPR" button's entry-point URL. Not a credential (it's a fixed,
 * public per-MLS-board constant baked into RPR's own URLs), so it's stored
 * directly on the sub-account doc rather than the secrets subcollection.
 *
 * POST   — save / update the org code. Body: { rprOrgId }
 * DELETE — clear it (disables the "View on RPR" button).
 */

interface PostBody {
  rprOrgId?: string;
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;

  let body: PostBody;
  try {
    body = (await request.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const raw = (body.rprOrgId ?? "").trim();
  if (!raw) {
    return NextResponse.json(
      { error: "RPR org code is required." },
      { status: 400 }
    );
  }
  // Accepts a bare code OR a pasted RPR URL — see parseRprOrgId.
  const rprOrgId = parseRprOrgId(raw);
  if (!rprOrgId) {
    return NextResponse.json(
      {
        error:
          "Couldn't find an RPR org code in that. Paste your RPR URL (the whole thing is fine) or just the code itself, e.g. \"ctconnm-n\".",
      },
      { status: 400 }
    );
  }

  await getAdminDb()
    .doc(`subAccounts/${subAccountId}`)
    .set(
      { rprOrgId, updatedAt: FieldValue.serverTimestamp() },
      { merge: true }
    );

  return NextResponse.json({ ok: true, rprOrgId });
}

export async function DELETE(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;

  await getAdminDb()
    .doc(`subAccounts/${subAccountId}`)
    .set(
      { rprOrgId: null, updatedAt: FieldValue.serverTimestamp() },
      { merge: true }
    );

  return NextResponse.json({ ok: true });
}
