import "server-only";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { writeImportChunk } from "@/lib/import/bulk-write";
import { applyChunkResultToJob } from "@/lib/import/job-progress";
import {
  IMPORT_ENTITIES,
  type ImportEntity,
  type ImportJob,
} from "@/types/import";

/**
 * Write one chunk of records into an import job. Sub-account admin only.
 *
 *   POST .../import/jobs/[jobId]/chunk   body: { entity, records: [...] }
 *
 * Validates + bulk-writes the chunk via the shared engine, then folds the
 * resulting counts into the job's per-entity totals (atomic increments) and
 * appends a capped sample of errors. The importer loops this, ≤500 records
 * per call, to get live progress + backpressure.
 */

const MAX_RECORDS = 500;

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string; jobId: string }> },
) {
  const { id: subAccountId, jobId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const b = (body ?? {}) as Record<string, unknown>;

  const entity = b.entity as ImportEntity;
  if (!IMPORT_ENTITIES.includes(entity)) {
    return NextResponse.json(
      { error: `entity must be one of: ${IMPORT_ENTITIES.join(", ")}.` },
      { status: 400 },
    );
  }
  if (!Array.isArray(b.records)) {
    return NextResponse.json(
      { error: "`records` must be an array." },
      { status: 400 },
    );
  }
  if (b.records.length > MAX_RECORDS) {
    return NextResponse.json(
      { error: `At most ${MAX_RECORDS} records per chunk.` },
      { status: 400 },
    );
  }

  const db = getAdminDb();
  const jobRef = db.doc(`importJobs/${jobId}`);
  const jobSnap = await jobRef.get();
  if (!jobSnap.exists) {
    return NextResponse.json({ error: "Import job not found" }, { status: 404 });
  }
  const job = jobSnap.data() as ImportJob;
  if (job.subAccountId !== subAccountId) {
    return NextResponse.json({ error: "Import job not found" }, { status: 404 });
  }
  if (job.status === "completed" || job.status === "failed") {
    return NextResponse.json(
      { error: "This import job is already finished." },
      { status: 409 },
    );
  }

  // Bulk-write the chunk (records + mappings). Suppresses webhooks/activities.
  const result = await writeImportChunk({
    subAccountId,
    agencyId: job.agencyId,
    createdByUid: access.uid,
    source: job.source,
    entity,
    records: b.records,
  });

  // Fold the chunk's counts into the job totals + capped errors.
  await applyChunkResultToJob(db, jobRef, entity, result);

  return NextResponse.json({
    ok: true,
    received: result.received,
    created: result.created,
    updated: result.updated,
    skipped: result.skipped,
    failed: result.failed,
    errors: result.errors,
  });
}
