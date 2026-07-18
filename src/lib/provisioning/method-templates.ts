import "server-only";

import {
  FieldValue,
  type DocumentData,
  type DocumentReference,
  type Firestore,
} from "firebase-admin/firestore";
import { METHOD_TEMPLATES } from "@templates/index";
import type { WorkflowDoc } from "@/types/workflows";

/**
 * Seeds the four Method Templates (missed-call textback, new-lead instant
 * response, post-closing review request, cold-lead 90-day revival) into a
 * freshly minted sub-account as ACTIVE workflows — "every new workspace
 * inherits them automatically" per the Method Template Library spec.
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
  for (const template of METHOD_TEMPLATES) {
    const seed = template.seed();
    const ref = db.collection("workflows").doc();
    const doc: Omit<WorkflowDoc, "id"> = {
      subAccountId: scope.subAccountId,
      agencyId: scope.agencyId,
      createdByUid: scope.createdByUid,
      name: template.displayName,
      status: "active",
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
