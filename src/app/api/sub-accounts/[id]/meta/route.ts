import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { unsubscribePageFromWebhook } from "@/lib/comms/meta";
import {
  deleteMetaSecrets,
  loadMetaSecrets,
} from "@/lib/comms/sub-account-secrets";
import type { SubAccountDoc } from "@/types";

/**
 * Disconnect the preview Facebook/Instagram inbox for a sub-account.
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

  const secrets = cfg?.pageId ? await loadMetaSecrets(id) : null;
  if (cfg?.pageId && secrets) {
    try {
      await unsubscribePageFromWebhook(cfg.pageId, secrets.pageAccessToken);
    } catch (err) {
      console.warn(`[meta/disconnect] unsubscribe failed sa=${id}`, err);
    }
  }

  await db.doc(`subAccounts/${id}`).update({
    metaConfig: null,
    updatedAt: FieldValue.serverTimestamp(),
  });
  // Clearing metaConfig alone would strand the token in the secrets
  // subcollection: invisible in the UI, still valid at Meta, still ours.
  await deleteMetaSecrets(id);

  return NextResponse.json({ ok: true });
}
