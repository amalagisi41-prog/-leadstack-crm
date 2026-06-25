import "server-only";

import type { Timestamp } from "firebase-admin/firestore";
import type { EventStatus, EventSource } from "@/types/events";

/** Public-API wire shape for CalendarEvent. Frozen contract. */

export interface EventApiObject {
  id: string;
  object: "event";
  livemode: boolean;
  title: string;
  start_at: string | null;
  end_at: string | null;
  contact_id: string | null;
  location: string;
  notes: string;
  status: EventStatus;
  source: EventSource;
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

export function serializeEventForApi(
  id: string,
  data: FirebaseFirestore.DocumentData,
  mode: "live" | "test",
): EventApiObject {
  return {
    id,
    object: "event",
    livemode: mode === "live",
    title: typeof data.title === "string" ? data.title : "",
    start_at: tsToIsoOrNull(data.startAt),
    end_at: tsToIsoOrNull(data.endAt),
    contact_id: (data.contactId as string | null) ?? null,
    location: typeof data.location === "string" ? data.location : "",
    notes: typeof data.notes === "string" ? data.notes : "",
    status: (data.status as EventStatus | undefined) ?? "scheduled",
    source: (data.source as EventSource | undefined) ?? "manual",
    territory_id: (data.territoryId as string | null) ?? null,
    created_at: tsToIso(data.createdAt),
    updated_at: tsToIso(data.updatedAt),
  };
}

export interface EventCreateInput {
  title: string;
  startAt: Date;
  endAt: Date;
  contactId: string | null;
  location: string;
  notes: string;
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
function asIso(v: unknown): Date | "invalid" | null {
  if (v === null || v === undefined) return null;
  if (typeof v !== "string") return "invalid";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "invalid";
  return d;
}

export function parseEventCreate(raw: unknown): ParseResult<EventCreateInput> {
  if (!raw || typeof raw !== "object") {
    return { ok: false, error: "Body must be a JSON object." };
  }
  const b = raw as Record<string, unknown>;
  const title = asString(b.title, 200);
  if (title === null || title.length === 0) {
    return { ok: false, error: "`title` is required." };
  }
  const startAt = asIso(b.start_at);
  if (startAt === "invalid" || startAt === null) {
    return { ok: false, error: "`start_at` is required (ISO 8601)." };
  }
  const endAt = asIso(b.end_at);
  if (endAt === "invalid" || endAt === null) {
    return { ok: false, error: "`end_at` is required (ISO 8601)." };
  }
  if (endAt.getTime() <= startAt.getTime()) {
    return { ok: false, error: "`end_at` must be after `start_at`." };
  }
  const location = asString(b.location, 500);
  if (location === null) return { ok: false, error: "`location` must be a string." };
  const notes = asString(b.notes, 5000);
  if (notes === null) return { ok: false, error: "`notes` must be a string." };
  const contactId = asString(b.contact_id, 200);
  if (contactId === null) return { ok: false, error: "`contact_id` must be a string." };
  const territoryId = asString(b.territory_id, 200);
  if (territoryId === null) {
    return { ok: false, error: "`territory_id` must be a string." };
  }
  return {
    ok: true,
    value: {
      title,
      startAt,
      endAt,
      location,
      notes,
      contactId: contactId.length === 0 ? null : contactId,
      territoryId: territoryId.length === 0 ? null : territoryId,
    },
  };
}

export interface EventPatchInput {
  title?: string;
  startAt?: Date;
  endAt?: Date;
  contactId?: string | null;
  location?: string;
  notes?: string;
  status?: EventStatus;
}

const VALID_STATUSES: EventStatus[] = [
  "scheduled",
  "awaiting_payment",
  "completed",
  "cancelled",
  "no_show",
];

export function parseEventPatch(raw: unknown): ParseResult<EventPatchInput> {
  if (!raw || typeof raw !== "object") {
    return { ok: false, error: "Body must be a JSON object." };
  }
  const b = raw as Record<string, unknown>;
  const patch: EventPatchInput = {};

  if (b.title !== undefined) {
    const v = asString(b.title, 200);
    if (v === null || v.length === 0) {
      return { ok: false, error: "`title` must be a non-empty string." };
    }
    patch.title = v;
  }
  if (b.start_at !== undefined) {
    const v = asIso(b.start_at);
    if (v === "invalid" || v === null) {
      return { ok: false, error: "`start_at` must be an ISO 8601 timestamp." };
    }
    patch.startAt = v;
  }
  if (b.end_at !== undefined) {
    const v = asIso(b.end_at);
    if (v === "invalid" || v === null) {
      return { ok: false, error: "`end_at` must be an ISO 8601 timestamp." };
    }
    patch.endAt = v;
  }
  if (patch.startAt && patch.endAt && patch.endAt.getTime() <= patch.startAt.getTime()) {
    return { ok: false, error: "`end_at` must be after `start_at`." };
  }
  if (b.location !== undefined) {
    const v = asString(b.location, 500);
    if (v === null) return { ok: false, error: "`location` must be a string." };
    patch.location = v;
  }
  if (b.notes !== undefined) {
    const v = asString(b.notes, 5000);
    if (v === null) return { ok: false, error: "`notes` must be a string." };
    patch.notes = v;
  }
  if (b.contact_id !== undefined) {
    if (b.contact_id === null) patch.contactId = null;
    else {
      const v = asString(b.contact_id, 200);
      if (v === null) return { ok: false, error: "`contact_id` must be a string." };
      patch.contactId = v.length === 0 ? null : v;
    }
  }
  if (b.status !== undefined) {
    if (
      typeof b.status !== "string" ||
      !VALID_STATUSES.includes(b.status as EventStatus)
    ) {
      return {
        ok: false,
        error: `\`status\` must be one of: ${VALID_STATUSES.join(", ")}.`,
      };
    }
    patch.status = b.status as EventStatus;
  }
  return { ok: true, value: patch };
}
