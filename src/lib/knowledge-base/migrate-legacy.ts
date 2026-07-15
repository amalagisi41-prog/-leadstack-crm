import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { getAgentProfile } from "@/lib/comms/ai/agent";
import { publishCallback } from "@/lib/automations/qstash";
import type { KnowledgeSourceDoc } from "@/types/knowledge-base";

/**
 * One-time migration: if the sub-account's AI Agent profile still has
 * the pre-v2 single-page `websiteUrl` set, and no `type: "url"` source
 * already points at it, auto-create one and schedule ingestion — same
 * lazy-migration shape as `lib/comms/ai/agent.ts::maybeMigrateLegacy()`.
 *
 * `websiteUrl`/`websiteKb` stay on the profile doc afterward (read-only
 * display in the UI) but stop being written to — the new source is the
 * one that gets refreshed going forward.
 *
 * Called from the sources list route so it happens transparently the
 * first time an operator opens the Knowledge Base section. Best-effort:
 * any failure is logged and swallowed — a missed migration just means
 * the operator re-adds the URL manually, not a broken page.
 */
export async function maybeMigrateLegacyWebsiteUrl(
  subAccountId: string,
): Promise<void> {
  try {
    const profile = await getAgentProfile(subAccountId);
    const url = profile?.websiteUrl?.trim();
    if (!url) return;

    const db = getAdminDb();
    const existing = await db
      .collection(`subAccounts/${subAccountId}/knowledgeBase`)
      .where("type", "==", "url")
      .where("sourceUrl", "==", url)
      .limit(1)
      .get();
    if (!existing.empty) return; // already migrated

    const subSnap = await db.doc(`subAccounts/${subAccountId}`).get();
    const agencyId = (subSnap.data()?.agencyId as string | undefined) ?? null;
    if (!agencyId) return;

    const ref = db.collection(`subAccounts/${subAccountId}/knowledgeBase`).doc();
    const now = FieldValue.serverTimestamp();
    const doc: Omit<KnowledgeSourceDoc, "id"> = {
      subAccountId,
      agencyId,
      type: "url",
      label: "Website homepage",
      sourceUrl: url,
      crawlUrl: null,
      maxPages: null,
      crawlJobId: null,
      crawlPollAttempts: 0,
      question: null,
      answer: null,
      rawText: null,
      status: "pending",
      errorMessage: null,
      chunkCount: 0,
      lastSyncedAt: null,
      createdByUid: "system-migration",
      createdAt: now,
      updatedAt: now,
    };
    await ref.set(doc);

    await publishCallback({
      pathname: `/api/sub-accounts/${subAccountId}/knowledge-base/sources/${ref.id}/ingest-step`,
      body: { subAccountId, sourceId: ref.id },
      delaySeconds: 0,
      deduplicationId: `kb_ingest_${ref.id}_0`,
    });
  } catch (err) {
    console.warn(
      `[knowledge-base/migrate-legacy] sa=${subAccountId} failed`,
      err,
    );
  }
}
