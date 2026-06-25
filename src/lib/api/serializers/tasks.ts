import "server-only";

import type { Timestamp } from "firebase-admin/firestore";

/** Public-API wire shape for Task. Frozen contract. */

export interface TaskApiObject {
  id: string;
  object: "task";
  livemode: boolean;
  title: string;
  notes: string;
  due_at: string | null;
  completed: boolean;
  completed_at: string | null;
  contact_id: string | null;
  deal_id: string | null;
  event_id: string | null;
  territory_id: string | null;
  created_at: string;
  updated_at: string;
}

function tsToIso(v: unknown): string {
  if (!v) return new Date(0).toISOString();
  if (v instanceof Date) return v.toISOString();
  const m = v as Partial<Timestamp>;
  if (typeof m.toDate === "function") return m.toDate().toISOString();
  if (typeof m.seconds === "number") return new Date(m.seconds * 1000).toISOString();
  return new Date(0).toISOString();
}
function tsToIsoOrNull(v: unknown): string | null {
  if (!v) return null;
  return tsToIso(v);
}

export function serializeTaskForApi(
  id: string,
  data: FirebaseFirestore.DocumentData,
  mode: "live" | "test",
): TaskApiObject {
  return {
    id,
    object: "task",
    livemode: mode === "live",
    title: typeof data.title === "string" ? data.title : "",
    notes: typeof data.notes === "string" ? data.notes : "",
    due_at: tsToIsoOrNull(data.dueAt),
    completed: !!data.completed,
    completed_at: tsToIsoOrNull(data.completedAt),
    contact_id: (data.contactId as string | null) ?? null,
    deal_id: (data.dealId as string | null) ?? null,
    event_id: (data.eventId as string | null) ?? null,
    territory_id: (data.territoryId as string | null) ?? null,
    created_at: tsToIso(data.createdAt),
    updated_at: tsToIso(data.updatedAt),
  };
}

export interface TaskCreateInput {
  title: string;
  notes: string;
  dueAt: Date | null;
  contactId: string | null;
  dealId: string | null;
  eventId: string | null;
  territoryId: string | null;
}

export interface ParseResult<T> {
  ok: boolean;
  value?: T;
  error?: string;
}

function asString(v: unknown, max: number): string | null {
  if (v === null || v === undefined) return "";
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (t.length > max) return null;
  return t;
}
function asIso(v: unknown): Date | null | "invalid" {
  if (v === null || v === undefined) return null;
  if (typeof v !== "string") return "invalid";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "invalid";
  return d;
}

export function parseTaskCreate(raw: unknown): ParseResult<TaskCreateInput> {
  if (!raw || typeof raw !== "object") {
    return { ok: false, error: "Body must be a JSON object." };
  }
  const b = raw as Record<string, unknown>;
  const title = asString(b.title, 200);
  if (title === null || title.length === 0) {
    return { ok: false, error: "`title` is required (string ≤ 200 chars)." };
  }
  const notes = asString(b.notes, 5000);
  if (notes === null) return { ok: false, error: "`notes` must be a string." };

  const dueAt = asIso(b.due_at);
  if (dueAt === "invalid") {
    return { ok: false, error: "`due_at` must be an ISO 8601 timestamp." };
  }

  const contactId = asString(b.contact_id, 200);
  if (contactId === null) return { ok: false, error: "`contact_id` must be a string." };
  const dealId = asString(b.deal_id, 200);
  if (dealId === null) return { ok: false, error: "`deal_id` must be a string." };
  const eventId = asString(b.event_id, 200);
  if (eventId === null) return { ok: false, error: "`event_id` must be a string." };
  const territoryId = asString(b.territory_id, 200);
  if (territoryId === null) {
    return { ok: false, error: "`territory_id` must be a string." };
  }

  return {
    ok: true,
    value: {
      title,
      notes,
      dueAt,
      contactId: contactId.length === 0 ? null : contactId,
      dealId: dealId.length === 0 ? null : dealId,
      eventId: eventId.length === 0 ? null : eventId,
      territoryId: territoryId.length === 0 ? null : territoryId,
    },
  };
}

export interface TaskPatchInput {
  title?: string;
  notes?: string;
  dueAt?: Date | null;
  completed?: boolean;
  contactId?: string | null;
  dealId?: string | null;
  eventId?: string | null;
}

export function parseTaskPatch(raw: unknown): ParseResult<TaskPatchInput> {
  if (!raw || typeof raw !== "object") {
    return { ok: false, error: "Body must be a JSON object." };
  }
  const b = raw as Record<string, unknown>;
  const patch: TaskPatchInput = {};

  if (b.title !== undefined) {
    const v = asString(b.title, 200);
    if (v === null || v.length === 0) {
      return { ok: false, error: "`title` must be a non-empty string." };
    }
    patch.title = v;
  }
  if (b.notes !== undefined) {
    const v = asString(b.notes, 5000);
    if (v === null) return { ok: false, error: "`notes` must be a string." };
    patch.notes = v;
  }
  if (b.due_at !== undefined) {
    const v = asIso(b.due_at);
    if (v === "invalid") {
      return { ok: false, error: "`due_at` must be an ISO 8601 timestamp or null." };
    }
    patch.dueAt = v;
  }
  if (b.completed !== undefined) {
    if (typeof b.completed !== "boolean") {
      return { ok: false, error: "`completed` must be a boolean." };
    }
    patch.completed = b.completed;
  }
  if (b.contact_id !== undefined) {
    if (b.contact_id === null) patch.contactId = null;
    else {
      const v = asString(b.contact_id, 200);
      if (v === null) return { ok: false, error: "`contact_id` must be a string." };
      patch.contactId = v.length === 0 ? null : v;
    }
  }
  if (b.deal_id !== undefined) {
    if (b.deal_id === null) patch.dealId = null;
    else {
      const v = asString(b.deal_id, 200);
      if (v === null) return { ok: false, error: "`deal_id` must be a string." };
      patch.dealId = v.length === 0 ? null : v;
    }
  }
  if (b.event_id !== undefined) {
    if (b.event_id === null) patch.eventId = null;
    else {
      const v = asString(b.event_id, 200);
      if (v === null) return { ok: false, error: "`event_id` must be a string." };
      patch.eventId = v.length === 0 ? null : v;
    }
  }

  return { ok: true, value: patch };
}
