import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { publishCallback, qstashIsConfigured } from "@/lib/automations/qstash";
import { PIPELINE_STAGES, type PipelineStageId } from "@/types/deals";
import { type ImportJob } from "@/types/import";
import type { GhlPhase } from "@/lib/import/ghl/transform";
import type { GhlImportConfig } from "@/types";

/**
 * Start a GHL migration (Phase 4). Sub-account admin only.
 *
 * Validates the stored connection + the operator-confirmed mapping, creates an
 * `importJobs` record carrying the mapping + entity list, and enqueues the
 * first QStash drain step. The drain (`/api/import/ghl/step`) then pulls →
 * transforms → writes page by page in the dependency order
 * contacts → opportunities → notes.
 */

const CANONICAL_IDS = new Set<string>(PIPELINE_STAGES.map((s) => s.id));
/** Fixed dependency order — children resolve their parent contact's mapping. */
const ENTITY_ORDER: GhlPhase[] = ["contacts", "opportunities", "notes"];

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;

  if (!qstashIsConfigured()) {
    return NextResponse.json(
      { error: "Imports require QStash, which isn't configured on this deployment." },
      { status: 503 },
    );
  }

  const db = getAdminDb();
  const subSnap = await db.doc(`subAccounts/${subAccountId}`).get();
  if (!subSnap.exists) {
    return NextResponse.json({ error: "Sub-account not found" }, { status: 404 });
  }
  const sub = subSnap.data() ?? {};
  const agencyId = (sub.agencyId as string | undefined) ?? null;
  const cfg = sub.ghlImportConfig as GhlImportConfig | null | undefined;
  if (!cfg?.token || !cfg.locationId) {
    return NextResponse.json(
      { error: "Connect a GoHighLevel token before starting an import." },
      { status: 400 },
    );
  }
  if (!agencyId) {
    return NextResponse.json(
      { error: "Sub-account is missing tenancy metadata." },
      { status: 500 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const b = (body ?? {}) as Record<string, unknown>;

  // Normalise the operator-confirmed mapping (defensive — the drain re-reads it).
  const rawMapping = (b.mapping ?? {}) as Record<string, unknown>;
  const defaultStageRaw = rawMapping.defaultStage;
  const defaultStage: PipelineStageId = CANONICAL_IDS.has(
    defaultStageRaw as string,
  )
    ? (defaultStageRaw as PipelineStageId)
    : "new";
  const defaultCurrency =
    typeof rawMapping.defaultCurrency === "string" &&
    rawMapping.defaultCurrency.length === 3
      ? (rawMapping.defaultCurrency as string).toUpperCase()
      : "USD";
  const mapping = {
    stageMap:
      typeof rawMapping.stageMap === "object" && rawMapping.stageMap !== null
        ? rawMapping.stageMap
        : {},
    defaultStage,
    defaultCurrency,
    customFields:
      typeof rawMapping.customFields === "object" &&
      rawMapping.customFields !== null
        ? rawMapping.customFields
        : {},
  };

  // Which entities to pull (always include contacts when anything else is on,
  // since children resolve through contact mappings).
  const requested = Array.isArray(b.entities)
    ? ENTITY_ORDER.filter((e) => (b.entities as unknown[]).includes(e))
    : ENTITY_ORDER;
  const entities = requested.length > 0 ? requested : ENTITY_ORDER;
  if (!entities.includes("contacts")) entities.unshift("contacts");

  // Create the job (carries the mapping + entity list for the drain).
  const ref = db.collection("importJobs").doc();
  const now = FieldValue.serverTimestamp();
  const job: Omit<ImportJob, "id"> & {
    ghlMapping: typeof mapping;
    ghlEntities: GhlPhase[];
  } = {
    agencyId,
    subAccountId,
    createdByUid: access.uid,
    source: "ghl",
    status: "running",
    totals: {},
    errors: [],
    createdAt: now,
    updatedAt: now,
    finishedAt: null,
    ghlMapping: mapping,
    ghlEntities: entities,
  };
  await ref.set(job);

  // Enqueue the first step.
  const first = entities[0];
  const scheduled = await publishCallback({
    pathname: "/api/import/ghl/step",
    body: { jobId: ref.id, subAccountId, entity: first, cursor: null },
    delaySeconds: 0,
    deduplicationId: `ghlstep_${ref.id}_${first}_start`,
  });
  if (!scheduled) {
    await ref.update({
      status: "failed",
      finishedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return NextResponse.json(
      { error: "Couldn't enqueue the import. Please try again." },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true, jobId: ref.id });
}
