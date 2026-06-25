import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { getApiKey, revokeApiKey } from "@/lib/firestore/api-keys";

/**
 * Revoke an API key. Idempotent — revoking an already-revoked key is a
 * no-op and still returns 200. Once revoked, the auth middleware (slice 2)
 * rejects any request bearing this key with 401, regardless of whether the
 * hash still matches.
 *
 * No PATCH route — names + scopes aren't editable post-mint. Operators who
 * want to change a key's scope mint a new key + revoke the old one. This
 * is the same model Stripe uses; it forces a deliberate rotation instead
 * of silent permission drift.
 */
export async function DELETE(
  request: Request,
  ctx: { params: Promise<{ id: string; keyId: string }> },
) {
  const { id: subAccountId, keyId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const doc = await getApiKey(subAccountId, keyId);
  if (!doc) {
    return NextResponse.json({ error: "Key not found" }, { status: 404 });
  }
  // Belt-and-braces tenancy check. requireSubAccountAdmin already gates by
  // subAccountId, but the doc carrying its own subAccountId means we catch
  // any future bug where the path param drifts from the doc's stamped
  // tenancy (e.g. a typo'd collection group restore).
  if (doc.subAccountId !== subAccountId) {
    return NextResponse.json({ error: "Key not found" }, { status: 404 });
  }

  if (doc.revokedAt) {
    return NextResponse.json({ ok: true, alreadyRevoked: true });
  }

  await revokeApiKey(subAccountId, keyId, access.uid);
  return NextResponse.json({ ok: true });
}
