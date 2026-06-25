import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import type { WriteChunkResult } from "@/lib/import/bulk-write";
import {
  IMPORT_ERROR_CAP,
  type ImportEntity,
  type ImportJob,
  type ImportRecordError,
} from "@/types/import";

/**
 * Fold a bulk-write chunk result into an import job: increment the per-entity
 * totals (atomic) and append a capped sample of errors. Shared by the chunk
 * endpoint and the GHL drain so both report progress identically.
 */
export async function applyChunkResultToJob(
  db: FirebaseFirestore.Firestore,
  jobRef: FirebaseFirestore.DocumentReference,
  entity: ImportEntity,
  result: WriteChunkResult,
): Promise<void> {
  await db.runTransaction(async (tx) => {
    const fresh = await tx.get(jobRef);
    if (!fresh.exists) return;
    const data = fresh.data() as ImportJob;
    const prev: ImportRecordError[] = Array.isArray(data.errors)
      ? data.errors
      : [];
    const errors = [...prev, ...result.errors].slice(0, IMPORT_ERROR_CAP);
    const p = `totals.${entity}`;
    tx.update(jobRef, {
      [`${p}.received`]: FieldValue.increment(result.received),
      [`${p}.created`]: FieldValue.increment(result.created),
      [`${p}.updated`]: FieldValue.increment(result.updated),
      [`${p}.skipped`]: FieldValue.increment(result.skipped),
      [`${p}.failed`]: FieldValue.increment(result.failed),
      errors,
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
}
