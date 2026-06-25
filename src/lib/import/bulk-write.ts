import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { GLOBAL_TERRITORY_ID } from "@/types";
import { parseContactCreate } from "@/lib/api/serializers/contacts";
import { parseDealCreate } from "@/lib/api/serializers/deals";
import { parseTaskCreate } from "@/lib/api/serializers/tasks";
import { parseEventCreate } from "@/lib/api/serializers/events";
import { loadCustomFieldDefs } from "@/lib/custom-fields/load-defs";
import { validateCustomFieldValues } from "@/lib/custom-fields/validation";
import type { CustomFieldDef } from "@/types/custom-fields";
import {
  IMPORT_ERROR_CAP,
  emptyTotals,
  type ImportEntity,
  type ImportEntityTotals,
  type ImportMappingDoc,
  type ImportRecordError,
  type ImportSource,
} from "@/types/import";

/**
 * Generic, GHL-agnostic bulk-write engine for one chunk of one entity.
 *
 * - Validates each record through the SAME v1 parsers + custom-field validation
 *   the public API uses, so imported records are identical to API-created ones.
 * - Resolves a child record's parent contact from `contact_external_id` via the
 *   per-sub-account import mappings.
 * - UPSERTS by the record's `external_id` (re-runs update, never duplicate).
 * - Writes in Firestore batches and SUPPRESSES webhooks + activity logs (no
 *   per-record `*.created` storm).
 *
 * The caller (the import endpoints) owns the `importJobs` lifecycle; this
 * function only writes records + mappings and returns counts, so it's
 * independently testable.
 */

const MAX_RECORDS_PER_CHUNK = 500;
const BATCH_OP_LIMIT = 400; // each record writes ≤2 ops; stay under Firestore's 500

export interface WriteChunkInput {
  subAccountId: string;
  agencyId: string;
  createdByUid: string;
  source: ImportSource;
  entity: ImportEntity;
  records: unknown[];
}

export type WriteChunkResult = ImportEntityTotals & {
  errors: ImportRecordError[];
};

/** Firestore-safe doc id from a composite key (ids can't contain "/" etc.). */
function mappingKey(
  system: ImportSource,
  entity: ImportEntity,
  externalId: string,
): string {
  return `${system}:${entity}:${externalId}`
    .replace(/[/.#$[\]]/g, "_")
    .slice(0, 300);
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}

type Built =
  | {
      ok: true;
      ref: FirebaseFirestore.DocumentReference;
      data: Record<string, unknown>;
      merge: boolean;
      docId: string;
      parentId: string | null;
    }
  | { ok: false; error: string };

export async function writeImportChunk(
  input: WriteChunkInput,
): Promise<WriteChunkResult> {
  const db = getAdminDb();
  const { subAccountId, agencyId, createdByUid, source, entity } = input;
  const records = Array.isArray(input.records) ? input.records : [];
  const result: WriteChunkResult = { ...emptyTotals(), errors: [] };
  result.received = records.length;
  if (records.length === 0) return result;
  if (records.length > MAX_RECORDS_PER_CHUNK) {
    throw new Error(
      `Chunk too large (${records.length} > ${MAX_RECORDS_PER_CHUNK}).`,
    );
  }

  const mappingsCol = db.collection(
    `subAccounts/${subAccountId}/importMappings`,
  );

  // ── One read pass: own-entity dedup keys + parent-contact resolution ──
  const recExt: (string | null)[] = [];
  const recContactExt: (string | null)[] = [];
  const keys = new Set<string>();
  for (const raw of records) {
    const r = (raw ?? {}) as Record<string, unknown>;
    const ext = str(r.external_id);
    const cext = str(r.contact_external_id);
    recExt.push(ext);
    recContactExt.push(cext);
    if (ext) keys.add(mappingKey(source, entity, ext));
    if (cext) keys.add(mappingKey(source, "contacts", cext));
  }
  const existing = new Map<string, ImportMappingDoc>();
  const keyList = [...keys];
  if (keyList.length > 0) {
    const snaps = await db.getAll(...keyList.map((k) => mappingsCol.doc(k)));
    for (const s of snaps) {
      if (s.exists) existing.set(s.id, s.data() as ImportMappingDoc);
    }
  }

  const defs: CustomFieldDef[] =
    entity === "contacts"
      ? await loadCustomFieldDefs(subAccountId, "contact")
      : entity === "deals"
        ? await loadCustomFieldDefs(subAccountId, "deal")
        : [];

  // ── Build + commit in batches ──
  let batch = db.batch();
  let ops = 0;
  const flush = async () => {
    if (ops > 0) {
      await batch.commit();
      batch = db.batch();
      ops = 0;
    }
  };

  for (let i = 0; i < records.length; i++) {
    const raw = (records[i] ?? {}) as Record<string, unknown>;
    const externalId = recExt[i];
    const contactExt = recContactExt[i];
    try {
      // Resolve parent contact (explicit id wins, else via mapping).
      let contactId = str(raw.contact_id);
      if (!contactId && contactExt) {
        contactId =
          existing.get(mappingKey(source, "contacts", contactExt))
            ?.leadstackId ?? null;
      }

      const ownMap = externalId
        ? existing.get(mappingKey(source, entity, externalId))
        : undefined;

      const built = buildWrite(db, {
        entity,
        raw,
        contactId,
        defs,
        externalId,
        source,
        agencyId,
        subAccountId,
        createdByUid,
        existing: ownMap,
      });
      if (!built.ok) {
        fail(result, entity, externalId, built.error);
        continue;
      }

      batch.set(built.ref, built.data, { merge: built.merge });
      ops++;

      if (externalId && !ownMap) {
        const mapRef = mappingsCol.doc(mappingKey(source, entity, externalId));
        const mapDoc: ImportMappingDoc = {
          entity,
          system: source,
          externalId,
          leadstackId: built.docId,
          parentId: built.parentId,
          createdAt: FieldValue.serverTimestamp(),
        };
        batch.set(mapRef, mapDoc);
        ops++;
        // Let later records in THIS chunk resolve a contact created earlier.
        existing.set(mappingKey(source, entity, externalId), {
          ...mapDoc,
          createdAt: null,
        });
      }

      if (ownMap) result.updated++;
      else result.created++;

      if (ops >= BATCH_OP_LIMIT) await flush();
    } catch (err) {
      fail(
        result,
        entity,
        externalId,
        err instanceof Error ? err.message : "write failed",
      );
    }
  }
  await flush();
  return result;
}

function fail(
  result: WriteChunkResult,
  entity: ImportEntity,
  externalId: string | null,
  error: string,
) {
  result.failed++;
  if (result.errors.length < IMPORT_ERROR_CAP) {
    result.errors.push({ entity, externalId, error });
  }
}

interface BuildArgs {
  entity: ImportEntity;
  raw: Record<string, unknown>;
  contactId: string | null;
  defs: CustomFieldDef[];
  externalId: string | null;
  source: ImportSource;
  agencyId: string;
  subAccountId: string;
  createdByUid: string;
  existing?: ImportMappingDoc;
}

/** Per-entity adapter: validate + shape the doc write (create or upsert). */
function buildWrite(db: FirebaseFirestore.Firestore, a: BuildArgs): Built {
  const ts = FieldValue.serverTimestamp();
  const isUpdate = !!a.existing;
  const tenancy = {
    agencyId: a.agencyId,
    subAccountId: a.subAccountId,
  };
  const stamp = {
    externalId: a.externalId,
    externalSource: a.source,
    createdByUid: `import:${a.source}`,
    mode: "live" as const,
  };

  switch (a.entity) {
    case "contacts": {
      const parsed = parseContactCreate(a.raw);
      if (!parsed.ok) return { ok: false, error: parsed.error ?? "invalid contact" };
      const v = parsed.value!;
      const cf = validateCustomFieldValues(a.raw.custom_fields, a.defs);
      if (!cf.ok) return { ok: false, error: cf.error ?? "invalid custom fields" };
      const editable = {
        name: v.name,
        email: v.email,
        phone: v.phone,
        company: v.company,
        address: v.address,
        source: v.source,
        tags: v.tags,
        pipelineStage: v.pipelineStage,
        territoryId: v.territoryId ?? GLOBAL_TERRITORY_ID,
        customFields: cf.value,
      };
      if (isUpdate) {
        const id = a.existing!.leadstackId;
        return {
          ok: true,
          ref: db.collection("contacts").doc(id),
          data: { ...editable, updatedAt: ts },
          merge: true,
          docId: id,
          parentId: null,
        };
      }
      const ref = db.collection("contacts").doc();
      return {
        ok: true,
        ref,
        data: {
          ...editable,
          attribution: null,
          emailOptedOut: false,
          smsOptedOut: false,
          countryCode: null,
          country: null,
          city: null,
          lat: null,
          lng: null,
          ...tenancy,
          ...stamp,
          createdAt: ts,
          updatedAt: ts,
        },
        merge: false,
        docId: ref.id,
        parentId: null,
      };
    }

    case "deals": {
      if (!a.contactId) {
        return { ok: false, error: "deal: contact_external_id did not resolve to a contact" };
      }
      const parsed = parseDealCreate({ ...a.raw, contact_id: a.contactId });
      if (!parsed.ok) return { ok: false, error: parsed.error ?? "invalid deal" };
      const v = parsed.value!;
      const cf = validateCustomFieldValues(a.raw.custom_fields, a.defs);
      if (!cf.ok) return { ok: false, error: cf.error ?? "invalid custom fields" };
      const editable = {
        title: v.title,
        value: v.value,
        currency: v.currency,
        contactId: v.contactId,
        stageId: v.stage,
        priority: v.priority,
        customFields: cf.value,
        territoryId: v.territoryId ?? GLOBAL_TERRITORY_ID,
      };
      if (isUpdate) {
        const id = a.existing!.leadstackId;
        return {
          ok: true,
          ref: db.collection("deals").doc(id),
          data: { ...editable, updatedAt: ts },
          merge: true,
          docId: id,
          parentId: null,
        };
      }
      const ref = db.collection("deals").doc();
      return {
        ok: true,
        ref,
        data: {
          ...editable,
          lostReason: null,
          ...tenancy,
          ...stamp,
          createdAt: ts,
          updatedAt: ts,
          stageChangedAt: ts,
        },
        merge: false,
        docId: ref.id,
        parentId: null,
      };
    }

    case "tasks": {
      const parsed = parseTaskCreate({ ...a.raw, contact_id: a.contactId });
      if (!parsed.ok) return { ok: false, error: parsed.error ?? "invalid task" };
      const v = parsed.value!;
      const editable = {
        title: v.title,
        notes: v.notes,
        dueAt: v.dueAt,
        contactId: v.contactId,
        dealId: v.dealId,
        eventId: v.eventId,
        territoryId: v.territoryId ?? GLOBAL_TERRITORY_ID,
      };
      if (isUpdate) {
        const id = a.existing!.leadstackId;
        return {
          ok: true,
          ref: db.collection("tasks").doc(id),
          data: { ...editable, updatedAt: ts },
          merge: true,
          docId: id,
          parentId: null,
        };
      }
      const ref = db.collection("tasks").doc();
      return {
        ok: true,
        ref,
        data: {
          ...editable,
          completed: false,
          completedAt: null,
          ...tenancy,
          ...stamp,
          createdAt: ts,
          updatedAt: ts,
        },
        merge: false,
        docId: ref.id,
        parentId: null,
      };
    }

    case "events": {
      const parsed = parseEventCreate({ ...a.raw, contact_id: a.contactId });
      if (!parsed.ok) return { ok: false, error: parsed.error ?? "invalid event" };
      const v = parsed.value!;
      const editable = {
        title: v.title,
        startAt: v.startAt,
        endAt: v.endAt,
        contactId: v.contactId,
        location: v.location,
        notes: v.notes,
        territoryId: v.territoryId ?? GLOBAL_TERRITORY_ID,
      };
      if (isUpdate) {
        const id = a.existing!.leadstackId;
        return {
          ok: true,
          ref: db.collection("events").doc(id),
          data: { ...editable, updatedAt: ts },
          merge: true,
          docId: id,
          parentId: null,
        };
      }
      const ref = db.collection("events").doc();
      return {
        ok: true,
        ref,
        data: {
          ...editable,
          status: "scheduled",
          source: "manual",
          ...tenancy,
          ...stamp,
          createdAt: ts,
          updatedAt: ts,
        },
        merge: false,
        docId: ref.id,
        parentId: null,
      };
    }

    case "notes": {
      const content = str(a.raw.content);
      if (!content) return { ok: false, error: "note: content is required" };
      // A note lives under its contact — resolution is mandatory.
      const parentId = a.contactId ?? a.existing?.parentId ?? null;
      if (!parentId) {
        return { ok: false, error: "note: contact_external_id did not resolve to a contact" };
      }
      if (isUpdate && a.existing?.parentId) {
        const id = a.existing.leadstackId;
        return {
          ok: true,
          ref: db
            .collection("contacts")
            .doc(a.existing.parentId)
            .collection("notes")
            .doc(id),
          data: { content, updatedAt: ts },
          merge: true,
          docId: id,
          parentId: a.existing.parentId,
        };
      }
      const ref = db
        .collection("contacts")
        .doc(parentId)
        .collection("notes")
        .doc();
      const provided =
        typeof a.raw.created_at === "string" ? new Date(a.raw.created_at) : null;
      const createdAt =
        provided && !Number.isNaN(provided.getTime()) ? provided : ts;
      return {
        ok: true,
        ref,
        data: { content, createdBy: `import:${a.source}`, createdAt },
        merge: false,
        docId: ref.id,
        parentId,
      };
    }

    default:
      return { ok: false, error: `unsupported entity: ${a.entity}` };
  }
}
