import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import {
  requireSubAccountAdmin,
  requireSubAccountMember,
} from "@/lib/auth/require-tenancy";
import { publishCallback, qstashIsConfigured } from "@/lib/automations/qstash";
import { validateSourceInput } from "@/lib/knowledge-base/validate";
import { maybeMigrateLegacyWebsiteUrl } from "@/lib/knowledge-base/migrate-legacy";
import type { KnowledgeSourceDoc } from "@/types/knowledge-base";

export const dynamic = "force-dynamic";

/**
 * AI Agent Knowledge Base sources.
 *
 * GET  — list every source for the sub-account. Member-readable.
 * POST — create a source (any of the 4 types) and schedule its first
 *        ingest step via QStash. Sub-account admin only.
 */

export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  await maybeMigrateLegacyWebsiteUrl(subAccountId);

  const snap = await getAdminDb()
    .collection(`subAccounts/${subAccountId}/knowledgeBase`)
    .get();
  const sources = snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<KnowledgeSourceDoc, "id">) }))
    .sort((a, b) => {
      const at = a.createdAt as { toMillis?: () => number } | null;
      const bt = b.createdAt as { toMillis?: () => number } | null;
      return (bt?.toMillis?.() ?? 0) - (at?.toMillis?.() ?? 0);
    });
  return NextResponse.json({ ok: true, sources });
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const validated = validateSourceInput(body);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }
  const data = validated.value;

  if (!qstashIsConfigured()) {
    return NextResponse.json(
      {
        error:
          "QStash is not configured on this deployment — knowledge base ingestion needs it to run in the background.",
      },
      { status: 503 },
    );
  }

  const db = getAdminDb();
  const subSnap = await db.doc(`subAccounts/${subAccountId}`).get();
  if (!subSnap.exists) {
    return NextResponse.json({ error: "Sub-account not found" }, { status: 404 });
  }
  const agencyId = (subSnap.data()?.agencyId as string | undefined) ?? null;
  if (!agencyId) {
    return NextResponse.json(
      { error: "Sub-account is missing tenancy metadata." },
      { status: 500 },
    );
  }

  const ref = db.collection(`subAccounts/${subAccountId}/knowledgeBase`).doc();
  const now = FieldValue.serverTimestamp();
  const doc: Omit<KnowledgeSourceDoc, "id"> = {
    subAccountId,
    agencyId,
    type: data.type,
    label: data.label,
    sourceUrl: data.sourceUrl,
    crawlUrl: data.crawlUrl,
    maxPages: data.maxPages,
    crawlJobId: null,
    crawlPollAttempts: 0,
    question: data.question,
    answer: data.answer,
    rawText: data.rawText,
    status: "pending",
    errorMessage: null,
    chunkCount: 0,
    lastSyncedAt: null,
    createdByUid: access.uid,
    createdAt: now,
    updatedAt: now,
  };
  await ref.set(doc);

  const scheduled = await publishCallback({
    pathname: `/api/sub-accounts/${subAccountId}/knowledge-base/sources/${ref.id}/ingest-step`,
    body: { subAccountId, sourceId: ref.id, attempts: 0 },
    delaySeconds: 0,
    deduplicationId: `kb_ingest_${ref.id}_0`,
  });
  if (!scheduled) {
    await ref.update({
      status: "failed",
      errorMessage: "Couldn't schedule ingestion. Try Re-sync.",
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  return NextResponse.json({ ok: true, id: ref.id });
}
