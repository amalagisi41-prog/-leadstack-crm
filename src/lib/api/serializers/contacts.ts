import "server-only";

import type { Timestamp } from "firebase-admin/firestore";
import type { ContactAttribution } from "@/types/contacts";
import type { CustomFieldValue } from "@/types/custom-fields";

/**
 * Public-API wire shape for Contact. Frozen contract — every change here
 * is a breaking API change that must ship as a new `LeadStack-Version`.
 *
 * Conventions (Stripe-style):
 *   - snake_case field names (vs internal camelCase)
 *   - `object: "contact"` discriminator
 *   - timestamps as ISO 8601 strings (created_at / updated_at)
 *   - `livemode: boolean` so callers can audit test vs live traffic
 *   - id at top, system fields at bottom (location / attribution nested)
 *
 * Slice 8 hosts the OpenAPI spec at `/openapi.json` derived from this
 * shape; until then it lives only in code + the slice 8 docs page.
 *
 * The serializer is DELIBERATELY decoupled from the internal `Contact`
 * type. Internal refactors (e.g. renaming `pipelineStage` to `stageId`)
 * must NOT silently change the wire format — the API tests in CI (v1.1
 * follow-up) snapshot this output and break on any change.
 */

export interface ContactApiObject {
  id: string;
  object: "contact";
  livemode: boolean;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  address: string | null;
  source: string | null;
  tags: string[];
  pipeline_stage: string | null;
  territory_id: string | null;
  email_opted_out: boolean;
  sms_opted_out: boolean;
  custom_fields: Record<string, CustomFieldValue> | null;
  attribution: ContactAttributionApiObject | null;
  location: ContactLocationApiObject | null;
  created_at: string;
  updated_at: string;
}

export interface ContactAttributionApiObject {
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  fbclid: string | null;
  gclid: string | null;
  landing_page: string | null;
  referrer: string | null;
}

export interface ContactLocationApiObject {
  country_code: string | null;
  country: string | null;
  city: string | null;
  lat: number | null;
  lng: number | null;
}

function tsToIso(v: unknown): string {
  if (!v) return new Date(0).toISOString();
  if (v instanceof Date) return v.toISOString();
  const maybe = v as Partial<Timestamp>;
  if (typeof maybe.toDate === "function") return maybe.toDate().toISOString();
  if (typeof maybe.seconds === "number") {
    return new Date(maybe.seconds * 1000).toISOString();
  }
  return new Date(0).toISOString();
}

function emptyToNull(s: string | null | undefined): string | null {
  if (s === null || s === undefined) return null;
  const t = String(s).trim();
  return t.length === 0 ? null : t;
}

/** Custom-field value map for the wire — null when empty/absent. */
export function customFieldsForApi(
  v: unknown,
): Record<string, CustomFieldValue> | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  return Object.keys(v as object).length > 0
    ? (v as Record<string, CustomFieldValue>)
    : null;
}

function serializeAttribution(
  a: ContactAttribution | null | undefined,
): ContactAttributionApiObject | null {
  if (!a) return null;
  // Treat "all fields null" as no attribution at all — cleaner wire shape.
  const hasAny =
    a.utmSource ||
    a.utmMedium ||
    a.utmCampaign ||
    a.utmContent ||
    a.utmTerm ||
    a.fbclid ||
    a.gclid ||
    a.landingPage ||
    a.referrer;
  if (!hasAny) return null;
  return {
    utm_source: a.utmSource ?? null,
    utm_medium: a.utmMedium ?? null,
    utm_campaign: a.utmCampaign ?? null,
    utm_content: a.utmContent ?? null,
    utm_term: a.utmTerm ?? null,
    fbclid: a.fbclid ?? null,
    gclid: a.gclid ?? null,
    landing_page: a.landingPage ?? null,
    referrer: a.referrer ?? null,
  };
}

/**
 * Serialize a raw Firestore Contact (from Admin SDK read) into the public
 * API shape. `mode` is the request's mode; gets stamped as `livemode`.
 */
export function serializeContactForApi(
  id: string,
  data: FirebaseFirestore.DocumentData,
  mode: "live" | "test",
): ContactApiObject {
  return {
    id,
    object: "contact",
    livemode: mode === "live",
    name: typeof data.name === "string" ? data.name : "",
    email: emptyToNull(data.email as string | null | undefined),
    phone: emptyToNull(data.phone as string | null | undefined),
    company: emptyToNull(data.company as string | null | undefined),
    address: emptyToNull(data.address as string | null | undefined),
    source: emptyToNull(data.source as string | null | undefined),
    tags: Array.isArray(data.tags) ? (data.tags as string[]) : [],
    pipeline_stage: (data.pipelineStage as string | null) ?? null,
    territory_id: (data.territoryId as string | null) ?? null,
    email_opted_out: !!data.emailOptedOut,
    sms_opted_out: !!data.smsOptedOut,
    custom_fields: customFieldsForApi(data.customFields),
    attribution: serializeAttribution(
      data.attribution as ContactAttribution | null,
    ),
    location:
      data.country || data.city || data.lat != null
        ? {
            country_code: (data.countryCode as string | null) ?? null,
            country: (data.country as string | null) ?? null,
            city: (data.city as string | null) ?? null,
            lat: (data.lat as number | null) ?? null,
            lng: (data.lng as number | null) ?? null,
          }
        : null,
    created_at: tsToIso(data.createdAt),
    updated_at: tsToIso(data.updatedAt),
  };
}

/**
 * Parsed + validated POST /v1/contacts body. Returned as a plain object
 * the route can hand to the Admin SDK write — no Firestore-specific types
 * leak through.
 */
export interface ContactCreateInput {
  name: string;
  email: string;
  phone: string;
  company: string;
  address: string;
  source: string;
  tags: string[];
  pipelineStage: string | null;
  territoryId: string | null;
  /** Validated against the sub-account's contact field defs in the route. */
  customFields?: Record<string, CustomFieldValue> | null;
}

export interface ParseResult<T> {
  ok: boolean;
  value?: T;
  error?: string;
}

const MAX_NAME = 200;
const MAX_FIELD = 500;
const MAX_TAGS = 50;
const MAX_TAG_LEN = 80;

function asString(v: unknown, max: number): string | null {
  if (v === null || v === undefined) return "";
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (t.length > max) return null;
  return t;
}

function asTags(v: unknown): string[] | null {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) return null;
  if (v.length > MAX_TAGS) return null;
  const out: string[] = [];
  for (const item of v) {
    if (typeof item !== "string") return null;
    const t = item.trim();
    if (t.length === 0 || t.length > MAX_TAG_LEN) return null;
    out.push(t);
  }
  return out;
}

/**
 * Parse + validate a POST body. Returns `{ ok: true, value }` or
 * `{ ok: false, error }`. The error string is human-readable and goes
 * straight into the 400 response.
 */
export function parseContactCreate(raw: unknown): ParseResult<ContactCreateInput> {
  if (!raw || typeof raw !== "object") {
    return { ok: false, error: "Body must be a JSON object." };
  }
  const b = raw as Record<string, unknown>;

  const name = asString(b.name, MAX_NAME);
  if (name === null || name.length === 0) {
    return { ok: false, error: "`name` is required (string ≤ 200 chars)." };
  }

  const email = asString(b.email, MAX_FIELD);
  if (email === null) return { ok: false, error: "`email` must be a string." };

  const phone = asString(b.phone, MAX_FIELD);
  if (phone === null) return { ok: false, error: "`phone` must be a string." };

  const company = asString(b.company, MAX_FIELD);
  if (company === null) {
    return { ok: false, error: "`company` must be a string." };
  }

  const address = asString(b.address, MAX_FIELD);
  if (address === null) {
    return { ok: false, error: "`address` must be a string." };
  }

  const source = asString(b.source, MAX_FIELD);
  if (source === null) {
    return { ok: false, error: "`source` must be a string." };
  }

  const tags = asTags(b.tags);
  if (tags === null) {
    return {
      ok: false,
      error: `\`tags\` must be an array of ≤${MAX_TAG_LEN}-char strings (max ${MAX_TAGS}).`,
    };
  }

  const pipelineStage = asString(b.pipeline_stage, MAX_FIELD);
  if (pipelineStage === null) {
    return { ok: false, error: "`pipeline_stage` must be a string." };
  }

  const territoryId = asString(b.territory_id, MAX_FIELD);
  if (territoryId === null) {
    return { ok: false, error: "`territory_id` must be a string." };
  }

  return {
    ok: true,
    value: {
      name,
      email,
      phone,
      company,
      address,
      source,
      tags,
      pipelineStage: pipelineStage.length === 0 ? null : pipelineStage,
      territoryId: territoryId.length === 0 ? null : territoryId,
    },
  };
}

/**
 * Parse + validate a PATCH body. Every field is optional; unknown fields
 * are tolerated but ignored. Returns the subset that was provided as a
 * partial update payload.
 */
export function parseContactPatch(
  raw: unknown,
): ParseResult<Partial<ContactCreateInput>> {
  if (!raw || typeof raw !== "object") {
    return { ok: false, error: "Body must be a JSON object." };
  }
  const b = raw as Record<string, unknown>;
  const patch: Partial<ContactCreateInput> = {};

  if (b.name !== undefined) {
    const v = asString(b.name, MAX_NAME);
    if (v === null || v.length === 0) {
      return { ok: false, error: "`name` must be a non-empty string." };
    }
    patch.name = v;
  }
  if (b.email !== undefined) {
    const v = asString(b.email, MAX_FIELD);
    if (v === null) return { ok: false, error: "`email` must be a string." };
    patch.email = v;
  }
  if (b.phone !== undefined) {
    const v = asString(b.phone, MAX_FIELD);
    if (v === null) return { ok: false, error: "`phone` must be a string." };
    patch.phone = v;
  }
  if (b.company !== undefined) {
    const v = asString(b.company, MAX_FIELD);
    if (v === null) return { ok: false, error: "`company` must be a string." };
    patch.company = v;
  }
  if (b.address !== undefined) {
    const v = asString(b.address, MAX_FIELD);
    if (v === null) return { ok: false, error: "`address` must be a string." };
    patch.address = v;
  }
  if (b.source !== undefined) {
    const v = asString(b.source, MAX_FIELD);
    if (v === null) return { ok: false, error: "`source` must be a string." };
    patch.source = v;
  }
  if (b.tags !== undefined) {
    const v = asTags(b.tags);
    if (v === null) {
      return {
        ok: false,
        error: `\`tags\` must be an array of ≤${MAX_TAG_LEN}-char strings (max ${MAX_TAGS}).`,
      };
    }
    patch.tags = v;
  }
  if (b.pipeline_stage !== undefined) {
    const v = asString(b.pipeline_stage, MAX_FIELD);
    if (v === null) {
      return { ok: false, error: "`pipeline_stage` must be a string." };
    }
    patch.pipelineStage = v.length === 0 ? null : v;
  }
  if (b.territory_id !== undefined) {
    const v = asString(b.territory_id, MAX_FIELD);
    if (v === null) {
      return { ok: false, error: "`territory_id` must be a string." };
    }
    patch.territoryId = v.length === 0 ? null : v;
  }

  return { ok: true, value: patch };
}
