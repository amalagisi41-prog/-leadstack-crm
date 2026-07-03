import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { SNAPSHOTS, type SnapshotId } from "./catalog";
import type { MessageTemplateDoc } from "@/types/automations";

/**
 * Apply a role snapshot to a sub-account: pipeline stages + email/SMS
 * templates + AI persona + draft workflows, all in one batch.
 *
 * Idempotent — templates + workflows use deterministic doc ids
 * (`snapshot_<id>_<key>` / `<subId>-<id>-<key>`) so re-applying the same
 * snapshot overwrites rather than duplicates. Switching snapshots leaves the
 * prior set in place (the operator can delete what they don't want).
 */
export async function applySnapshot(
  subAccountId: string,
  agencyId: string,
  createdByUid: string,
  snapshotId: SnapshotId,
  options?: { businessName?: string },
): Promise<{ snapshotId: SnapshotId; templates: number; workflows: number }> {
  const def = SNAPSHOTS[snapshotId] ?? SNAPSHOTS.solo_agent;
  const db = getAdminDb();
  const now = FieldValue.serverTimestamp();
  const batch = db.batch();

  // 1. Pipeline stage labels.
  batch.update(db.collection("subAccounts").doc(subAccountId), {
    pipelineStages: def.pipelineStages,
  });

  // 2. Email + SMS templates (stable ids per snapshot for idempotent re-apply).
  for (const tpl of def.templates) {
    const docId = `snapshot_${def.id}_${tpl.key}`;
    const ref = db.collection("message_templates").doc(docId);
    batch.set(
      ref,
      {
        id: docId,
        type: tpl.type,
        name: tpl.name,
        subject: tpl.subject,
        body: tpl.body,
        agencyId,
        subAccountId,
        createdByUid,
        createdAt: now,
        updatedAt: now,
      } satisfies MessageTemplateDoc,
      { merge: true },
    );
  }

  // 3. AI persona (don't clobber an operator-set businessName on re-apply).
  const businessName = options?.businessName?.trim() ?? "";
  batch.set(
    db.collection("subAccounts").doc(subAccountId).collection("aiAgent").doc("profile"),
    {
      systemPrompt: def.persona,
      ...(businessName ? { businessName } : {}),
      hoursStart: 8,
      hoursEnd: 20,
      timezone: "America/New_York",
      escalationKeywords: ["speak to someone", "call me now", "urgent", "complaint"],
      escalationNotifyEmail: null,
      websiteUrl: null,
      websiteKb: null,
      websiteKbFetchedAt: null,
      createdAt: now,
      updatedAt: now,
    },
    { merge: true },
  );

  // 4. Draft workflows wired to the right triggers.
  for (const wf of def.workflows) {
    const wfId = `${subAccountId}-${def.id}-${wf.key}`;
    batch.set(db.collection("workflows").doc(wfId), {
      id: wfId,
      subAccountId,
      agencyId,
      createdByUid,
      name: wf.name,
      status: "draft",
      trigger: wf.trigger,
      startNodeId: wf.startNodeId,
      nodes: wf.nodes,
      stats: { enrolled: 0, completed: 0 },
      createdAt: now,
      updatedAt: now,
    });
  }

  await batch.commit();

  return {
    snapshotId: def.id,
    templates: def.templates.length,
    workflows: def.workflows.length,
  };
}
