import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import {
  qstashIsConfigured,
  publishCallback,
  verifyQStashSignature,
} from "@/lib/automations/qstash";
import { writeImportChunk, type WriteChunkResult } from "@/lib/import/bulk-write";
import { applyChunkResultToJob } from "@/lib/import/job-progress";
import {
  GhlApiError,
  listContactsPage,
  listContactNotes,
  listOpportunitiesPage,
  type GhlCursor,
} from "@/lib/import/ghl/client";
import {
  ghlContactToChunk,
  ghlNoteToChunk,
  ghlOpportunityToChunk,
  type GhlImportMapping,
  type GhlPhase,
} from "@/lib/import/ghl/transform";
import { emptyTotals, type ImportEntity, type ImportJob } from "@/types/import";
import type { GhlImportConfig } from "@/types";

export const dynamic = "force-dynamic";

/**
 * GHL drain step — a QStash callback that pulls ONE page of the current GHL
 * entity, transforms it, writes it via the Phase 3 engine, and schedules the
 * next page (or the next entity, or finishes). Public path; security is the
 * Upstash-Signature check.
 *
 * Order: contacts → opportunities → notes (children resolve their parent
 * contact via the mappings created in the contacts phase). Returning 500 makes
 * QStash retry the SAME step — safe, because every write is an idempotent
 * upsert by external id.
 */

/** GHL pull phases, in dependency order. */
const PHASE_ORDER: GhlPhase[] = ["contacts", "opportunities", "notes"];
const NOTES_CONTACT_PAGE = 25; // small: one note-fetch per contact, keep under burst
const STEP_DELAY: Record<string, number> = {
  contacts: 1,
  opportunities: 1,
  notes: 3,
};

interface StepBody {
  jobId?: string;
  subAccountId?: string;
  entity?: GhlPhase;
  cursor?: GhlCursor;
}

function cursorKey(c: GhlCursor): string {
  if (!c) return "start";
  return `${c.startAfter ?? ""}_${c.startAfterId ?? ""}`.replace(
    /[^a-zA-Z0-9]/g,
    "_",
  );
}

function mergeResults(a: WriteChunkResult, b: WriteChunkResult): WriteChunkResult {
  return {
    received: a.received + b.received,
    created: a.created + b.created,
    updated: a.updated + b.updated,
    skipped: a.skipped + b.skipped,
    failed: a.failed + b.failed,
    errors: [...a.errors, ...b.errors],
  };
}

export async function POST(request: Request) {
  if (!qstashIsConfigured()) {
    return NextResponse.json({ error: "QStash not configured" }, { status: 503 });
  }
  const signature = request.headers.get("upstash-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 401 });
  }
  const rawBody = await request.text();
  if (!(await verifyQStashSignature(signature, rawBody))) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: StepBody;
  try {
    payload = JSON.parse(rawBody) as StepBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { jobId, subAccountId } = payload;
  const entity = payload.entity;
  if (!jobId || !subAccountId || !entity || !PHASE_ORDER.includes(entity)) {
    return NextResponse.json({ error: "Bad step payload" }, { status: 400 });
  }
  const cursor = payload.cursor ?? null;

  const db = getAdminDb();
  const jobRef = db.doc(`importJobs/${jobId}`);
  const jobSnap = await jobRef.get();
  if (!jobSnap.exists) return NextResponse.json({ ok: true, stopped: true });
  const job = jobSnap.data() as ImportJob & {
    ghlMapping?: GhlImportMapping;
    ghlEntities?: GhlPhase[];
  };
  if (job.subAccountId !== subAccountId || job.status !== "running") {
    return NextResponse.json({ ok: true, stopped: true });
  }

  // Token from the stored connection (never carried in the QStash message).
  const subSnap = await db.doc(`subAccounts/${subAccountId}`).get();
  const cfg = subSnap.data()?.ghlImportConfig as GhlImportConfig | null | undefined;
  if (!cfg?.token || !cfg.locationId) {
    await finishJob(db, jobRef, "failed");
    return NextResponse.json({ ok: true, stopped: "disconnected" });
  }
  const mapping = (job.ghlMapping ?? {
    stageMap: {},
    defaultStage: "new",
    defaultCurrency: "USD",
    customFields: {},
  }) as GhlImportMapping;
  const entities = job.ghlEntities ?? PHASE_ORDER;

  const base = {
    subAccountId,
    agencyId: job.agencyId,
    createdByUid: job.createdByUid,
    source: "ghl" as const,
  };

  try {
    let next: GhlCursor = null;

    if (entity === "contacts") {
      const page = await listContactsPage(cfg.token, cfg.locationId, cursor);
      const records = page.items.map((c) => ghlContactToChunk(c, mapping));
      await writeAndRecord(db, jobRef, "contacts", { ...base }, records);
      next = page.next;
    } else if (entity === "opportunities") {
      const page = await listOpportunitiesPage(cfg.token, cfg.locationId, cursor);
      const records = page.items.map((o) => ghlOpportunityToChunk(o, mapping));
      await writeAndRecord(db, jobRef, "deals", { ...base }, records);
      next = page.next;
    } else {
      // notes: page contacts small, fetch each contact's notes, write together.
      const page = await listContactsPage(
        cfg.token,
        cfg.locationId,
        cursor,
        NOTES_CONTACT_PAGE,
      );
      const noteRecords: unknown[] = [];
      for (const c of page.items) {
        const notes = await listContactNotes(cfg.token, c.id);
        for (const n of notes) noteRecords.push(ghlNoteToChunk(n));
      }
      await writeAndRecord(db, jobRef, "notes", { ...base }, noteRecords);
      next = page.next;
    }

    // Advance: next page of this entity, else next entity, else finish.
    if (next) {
      await schedule(jobId, subAccountId, entity, next);
    } else {
      const idx = entities.indexOf(entity);
      const following = entities.slice(idx + 1);
      if (following.length > 0) {
        await schedule(jobId, subAccountId, following[0], null);
      } else {
        await finishJob(db, jobRef, "completed");
      }
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof GhlApiError && (err.status === 401 || err.status === 403)) {
      // Auth failure won't fix itself — fail the job, don't retry.
      await finishJob(db, jobRef, "failed");
      return NextResponse.json({ ok: true, stopped: "auth" });
    }
    // Transient — let QStash retry the same step (idempotent upserts).
    console.error("[import/ghl/step] failed", err);
    return NextResponse.json({ error: "step failed" }, { status: 500 });
  }
}

/** Write records in ≤500 slices and fold the merged counts into the job. */
async function writeAndRecord(
  db: FirebaseFirestore.Firestore,
  jobRef: FirebaseFirestore.DocumentReference,
  entity: ImportEntity,
  base: {
    subAccountId: string;
    agencyId: string;
    createdByUid: string;
    source: "ghl";
  },
  records: unknown[],
): Promise<void> {
  let merged: WriteChunkResult = { ...emptyTotals(), errors: [] };
  for (let i = 0; i < records.length; i += 500) {
    const slice = records.slice(i, i + 500);
    const r = await writeImportChunk({ ...base, entity, records: slice });
    merged = mergeResults(merged, r);
  }
  await applyChunkResultToJob(db, jobRef, entity, merged);
}

async function schedule(
  jobId: string,
  subAccountId: string,
  entity: GhlPhase,
  cursor: GhlCursor,
): Promise<void> {
  await publishCallback({
    pathname: "/api/import/ghl/step",
    body: { jobId, subAccountId, entity, cursor },
    delaySeconds: STEP_DELAY[entity] ?? 1,
    deduplicationId: `ghlstep_${jobId}_${entity}_${cursorKey(cursor)}`,
  });
}

async function finishJob(
  db: FirebaseFirestore.Firestore,
  jobRef: FirebaseFirestore.DocumentReference,
  status: "completed" | "failed",
): Promise<void> {
  await jobRef.update({
    status,
    finishedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
}
