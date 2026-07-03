import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";

/**
 * PATCH /api/sub-accounts/[id]/domain
 *
 * Saves (or clears) the sub-account's chosen custom domain. Admin only.
 * Body: { domain: string | null }. The value is normalized to a bare host
 * (no scheme, no path, no trailing slash).
 */
const DOMAIN_RE = /^[a-z0-9.-]+\.[a-z]{2,}$/i;

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;

  let body: { domain?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  let domain: string | null;
  if (body.domain === null || body.domain === "") {
    domain = null;
  } else if (typeof body.domain !== "string") {
    return NextResponse.json({ error: "domain must be a string or null." }, { status: 400 });
  } else {
    const normalized = body.domain
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .replace(/\/.*$/, "");
    if (!DOMAIN_RE.test(normalized)) {
      return NextResponse.json(
        { error: "Enter a bare domain like example.com (no https://, no path)." },
        { status: 400 },
      );
    }
    domain = normalized;
  }

  await getAdminDb().doc(`subAccounts/${subAccountId}`).update({
    customDomain: domain,
    updatedAt: FieldValue.serverTimestamp(),
  });

  return NextResponse.json({ ok: true, domain });
}
