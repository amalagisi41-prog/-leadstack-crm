import type { Timestamp, FieldValue } from "firebase/firestore";

/**
 * Import infrastructure (Phase 3) — generic, GHL-agnostic bulk ingest.
 *
 * The importer (Phase 4 GHL connector, or the CSV importer) creates an
 * `importJobs/{id}`, then streams records in chunks through the bulk-write
 * service. Records carry an `external_id` (the source system's id) so re-runs
 * UPSERT instead of duplicating; child records (deals/tasks/events/notes)
 * carry `contact_external_id` to resolve their parent contact. The mapping
 * `subAccounts/{id}/importMappings/{key}` is the source-id ↔ LeadStack-id
 * index that powers both dedup and relationship resolution.
 */

export type ImportSource = "csv" | "ghl" | "api";

export type ImportEntity = "contacts" | "deals" | "tasks" | "events" | "notes";

export const IMPORT_ENTITIES: ImportEntity[] = [
  "contacts",
  "deals",
  "tasks",
  "events",
  "notes",
];

export type ImportJobStatus = "queued" | "running" | "completed" | "failed";

/** Running tally per entity for an import job. */
export interface ImportEntityTotals {
  received: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
}

export function emptyTotals(): ImportEntityTotals {
  return { received: 0, created: 0, updated: 0, skipped: 0, failed: 0 };
}

/** A single failed record, surfaced in the job's capped error list. */
export interface ImportRecordError {
  entity: ImportEntity;
  externalId: string | null;
  error: string;
}

/** Keep the stored error list bounded — a 50k all-success job writes 0 rows. */
export const IMPORT_ERROR_CAP = 500;

export interface ImportJob {
  id: string;
  agencyId: string;
  subAccountId: string;
  createdByUid: string;
  source: ImportSource;
  status: ImportJobStatus;
  /** Per-entity tallies; entities not touched are absent. */
  totals: Partial<Record<ImportEntity, ImportEntityTotals>>;
  /** Capped sample of per-record failures for the run summary. */
  errors: ImportRecordError[];
  createdAt: Timestamp | FieldValue | null;
  updatedAt: Timestamp | FieldValue | null;
  finishedAt: Timestamp | FieldValue | null;
}

/**
 * source-id ↔ LeadStack-id mapping, at
 * `subAccounts/{subAccountId}/importMappings/{key}` where
 * key = `${system}:${entity}:${safe(externalId)}`. Server-only.
 * `parentId` is set for notes (the contact the note lives under) so an
 * upsert can locate the subcollection doc.
 */
export interface ImportMappingDoc {
  entity: ImportEntity;
  system: ImportSource;
  externalId: string;
  leadstackId: string;
  parentId?: string | null;
  createdAt: Timestamp | FieldValue | null;
}
