import "server-only";

import {
  FieldValue,
  type DocumentData,
  type DocumentReference,
  type Firestore,
} from "firebase-admin/firestore";
import { TEMPLATE_PRESETS } from "./template-presets";

/**
 * Adapter type covering the `.set(ref, data)` shape of both WriteBatch and
 * Transaction. Both provide the same call signature; we accept a callback
 * to dodge TypeScript's struggle with the WriteBatch | Transaction union
 * (each `.set()` overload returns its own type, and TS can't unify them).
 */
export type SeedSetFn = (
  ref: DocumentReference<DocumentData>,
  data: DocumentData,
) => void;

/**
 * Seeds the default templates (Welcome email, Welcome SMS, Notify owner)
 * into a freshly minted sub-account. The list is sourced from
 * TEMPLATE_PRESETS — add a preset there and it ships here automatically.
 * Called from both creation paths:
 *
 *   - /api/auth/signup (bootstrap "Main" sub-account, batch-based)
 *   - /api/agency/sub-accounts (every additional sub-account, transaction-based)
 *
 * The setFn parameter wraps whichever batch/transaction the caller already
 * has open — keeps the seed atomic with the rest of the sub-account
 * creation, so a partial failure can't leave the sub-account doc but no
 * templates (or templates without their parent sub-account).
 *
 * Backfill of existing sub-accounts is intentionally NOT done here — per the
 * locked decision, only new sub-accounts going forward get the seed.
 */
export function seedDefaultTemplates(
  db: Firestore,
  setFn: SeedSetFn,
  scope: {
    agencyId: string;
    subAccountId: string;
    createdByUid: string;
  },
): void {
  for (const preset of TEMPLATE_PRESETS) {
    const ref = db.collection("message_templates").doc();
    setFn(ref, {
      id: ref.id,
      type: preset.type,
      name: preset.label,
      subject: preset.type === "email" ? preset.subject : null,
      body: preset.body,
      agencyId: scope.agencyId,
      subAccountId: scope.subAccountId,
      createdByUid: scope.createdByUid,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
}
