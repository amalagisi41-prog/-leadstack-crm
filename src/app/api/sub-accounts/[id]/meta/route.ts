import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { unsubscribePageFromWebhook } from "@/lib/comms/meta";
import type { SubAccountDoc } from "@/types";

/**
 * Disconnect the BETA Facebook/Instagram inbox for a sub-account.
 *
 *   DELETE /api/sub-accounts/[id]/meta
 *
 * Sub-account admin only. Best-effort unsubscribes the Page from our webhook,
 * then clears `metaConfig`. No message history is touched. Re-connecting is a
 * fresh OAuth pass.
 */

export async function DELETE(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const access = await requireSubAccountAdmin(request, id);
  if (access instanceof NextResponse) return access;

  const db = getAdminDb();
  const snap = await db.doc(`subAccounts/${id}`).get();
  const sa = snap.exists ? (snap.data() as SubAccountDoc) : null;
  const cfg = sa?.metaConfig ?? null;

  if (cfg?.pageId && cfg.pageAccessToken) {
    try {
      await unsubscribePageFromWebhook(cfg.pageId, cfg.pageAccessToken);
    } catch (err) {
      console.warn(`[meta/disconnect] unsubscribe failed sa=${id}`, err);
    }
  }

  await db.doc(`subAccounts/${id}`).update({
    metaConfig: null,
    updatedAt: FieldValue.serverTimestamp(),
  });

  return NextResponse.json({ ok: true });
}
