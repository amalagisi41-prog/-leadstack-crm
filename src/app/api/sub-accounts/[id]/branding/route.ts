import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";

/**
 * PATCH /api/sub-accounts/[id]/branding
 *
 * Update this sub-account's external-facing branding. v1 = logo URL only
 * (paste a public https URL). Renders on quote/invoice emails, public
 * /q/[token] pages, and PDFs — the surfaces this client's customers see.
 *
 * Auth: sub-account admin OR agency owner (via requireSubAccountAdmin).
 *
 * Body: { logoUrl: string | null }
 *   - null  → wipe the logo
 *   - ""    → wipe the logo
 *   - any other string → must start with http(s)://
 */

const URL_RE = /^https?:\/\/.+/i;

interface PatchBody {
  logoUrl?: string | null;
}

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;

  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};

  if ("logoUrl" in body) {
    if (body.logoUrl === null || body.logoUrl === "") {
      updates.logoUrl = null;
    } else if (typeof body.logoUrl === "string") {
      const trimmed = body.logoUrl.trim();
      if (!URL_RE.test(trimmed)) {
        return NextResponse.json(
          { error: "logoUrl must start with http:// or https://." },
          { status: 400 },
        );
      }
      updates.logoUrl = trimmed.slice(0, 2_000);
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { error: "No valid fields to update" },
      { status: 400 },
    );
  }

  await getAdminDb()
    .doc(`subAccounts/${subAccountId}`)
    .set(
      {
        ...updates,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

  return NextResponse.json({ ok: true, ...updates });
}
