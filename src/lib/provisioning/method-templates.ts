import "server-only";

import {
  FieldValue,
  type DocumentData,
  type DocumentReference,
  type Firestore,
} from "firebase-admin/firestore";
import { METHOD_TEMPLATES } from "@templates/index";
import { qstashIsConfigured } from "@/lib/automations/qstash";
import type { WorkflowDoc } from "@/types/workflows";

/**
 * Seeds the four Method Templates (missed-call textback, new-lead instant
 * response, post-closing review request, cold-lead 90-day revival) into a
 * freshly minted sub-account — "every new workspace inherits them
 * automatically" per the Method Template Library spec.
 *
 * Seeded ACTIVE when this deployment can actually execute them, PAUSED when
 * it cannot (see the note at the seeding loop). They are always created
 * either way; only the starting state differs.
 * Mirrors `lib/automations/seed-templates.ts::seedDefaultTemplates`'s
 * batch/transaction-agnostic shape exactly, for the same reason: it needs
 * to compose atomically into whichever write the caller already has open
 * (the provisioning batch in provision-agency.ts, or the transaction in
 * /api/agency/sub-accounts) so a partial failure can't leave a sub-account
 * with no templates.
 *
 * Called from:
 *   - lib/auth/provision-agency.ts (every brand-new agency's Main sub-account)
 *   - /api/agency/sub-accounts (every additional sub-account)
 *
 * Sub-accounts that already existed before this shipped are intentionally
 * NOT backfilled here — same "new sub-accounts only" posture as
 * seedDefaultTemplates. The one exception with real behavioral stakes
 * (post-closing review requests) has its own narrow, non-destructive
 * fallback at the call site instead — see /api/deals/[id]/route.ts.
 */
export type SeedSetFn = (
  ref: DocumentReference<DocumentData>,
  data: DocumentData,
) => void;

export function seedMethodTemplates(
  db: Firestore,
  setFn: SeedSetFn,
  scope: {
    agencyId: string;
    subAccountId: string;
    createdByUid: string;
  },
): void {
  // Every one of these workflows executes by scheduling its first node through
  // QStash. Without QStash configured, `engine.ts` marks the run failed and
  // returns immediately — but only AFTER the contact has been enrolled and
  // `stats.enrolled` incremented. Seeding them "active" on a deployment that
  // cannot run them therefore produced the worst possible failure: the list
  // says Active, the counter climbs, and nothing is ever sent. Nobody finds
  // out until a lead complains they were never contacted.
  //
  // "Answer every new lead within 60 seconds" is this product's headline
  // promise. It must not be able to silently not happen.
  //
  // Seeding them PAUSED instead is honest and reversible: the workflows are
  // still there, fully built, and one toggle away — once QStash is configured
  // and the operator turns them on deliberately.
  const canExecute = qstashIsConfigured();

  for (const template of METHOD_TEMPLATES) {
    const seed = template.seed();
    const ref = db.collection("workflows").doc();
    const doc: Omit<WorkflowDoc, "id"> = {
      subAccountId: scope.subAccountId,
      agencyId: scope.agencyId,
      createdByUid: scope.createdByUid,
      name: template.displayName,
      status: canExecute ? "active" : "paused",
      pausedReason: canExecute
        ? null
        : "Automatic sending isn't configured on this deployment yet, so this " +
          "workflow is paused rather than enrolling leads it can't contact. " +
          "Add your QStash keys, then turn it on.",
      trigger: seed.trigger,
      startNodeId: seed.startNodeId,
      nodes: seed.nodes,
      stats: { enrolled: 0, completed: 0 },
      templateKey: template.key,
      templateVersion: template.version,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };
    setFn(ref, { id: ref.id, ...doc });
  }
}
