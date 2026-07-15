import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { publishCallback, qstashIsConfigured } from "@/lib/automations/qstash";

export const dynamic = "force-dynamic";

/**
 * Re-runs ingestion for an existing source (content may have changed, or
 * a previous attempt failed). Resets status to "pending", clears any
 * stale crawl job id + error, and reschedules the ingest worker.
 */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string; sourceId: string }> },
) {
  const { id: subAccountId, sourceId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;

  if (!qstashIsConfigured()) {
    return NextResponse.json(
      { error: "QStash is not configured on this deployment." },
      { status: 503 },
    );
  }

  const db = getAdminDb();
  const ref = db.doc(`subAccounts/${subAccountId}/knowledgeBase/${sourceId}`);
  const snap = await ref.get();
  if (!snap.exists) {
    return NextResponse.json({ error: "Source not found" }, { status: 404 });
  }

  await ref.update({
    status: "pending",
    errorMessage: null,
    crawlJobId: null,
    updatedAt: FieldValue.serverTimestamp(),
  });

  // Fresh dedup id (timestamp-suffixed) so a re-sync isn't collapsed
  // against a stale in-flight dedup window from a previous attempt.
  const scheduled = await publishCallback({
    pathname: `/api/sub-accounts/${subAccountId}/knowledge-base/sources/${sourceId}/ingest-step`,
    body: { subAccountId, sourceId, attempts: 0 },
    delaySeconds: 0,
    deduplicationId: `kb_ingest_${sourceId}_resync_${Date.now()}`,
  });
  if (!scheduled) {
    await ref.update({
      status: "failed",
      errorMessage: "Couldn't schedule ingestion. Try again.",
      updatedAt: FieldValue.serverTimestamp(),
    });
    return NextResponse.json(
      { error: "Couldn't schedule ingestion." },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true });
}
