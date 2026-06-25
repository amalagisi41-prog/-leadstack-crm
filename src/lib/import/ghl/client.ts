import "server-only";

import type {
  GhlContact,
  GhlCustomFieldDef,
  GhlNote,
  GhlOpportunity,
  GhlPipeline,
} from "@/lib/import/ghl/transform";

/**
 * GoHighLevel v2 API client (Phase 4) — server-only, authed with a
 * Private Integration Token (PIT). Thin paginated readers for the entities
 * the v1 connector imports: contacts (+ per-contact notes), opportunities
 * (+ pipelines), and custom-field definitions.
 *
 * This is the ONLY part of Phase 4 that needs a live GHL account to validate;
 * the transformers it feeds are fully fixture-tested. Endpoint paths/params
 * follow GHL's documented v2 contract (base `services.leadconnectorhq.com`,
 * `Version` header, 100/page); pin them against the live docs before shipping.
 */

const GHL_BASE = "https://services.leadconnectorhq.com";
const GHL_VERSION = "2021-07-28";
const PAGE_SIZE = 100;

/** Burst limit is 100 req / 10s; back off on 429 + 5xx with bounded retries. */
const MAX_RETRIES = 4;

export class GhlApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "GhlApiError";
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function ghlFetch<T>(
  token: string,
  path: string,
  params: Record<string, string | number | undefined> = {},
): Promise<T> {
  const url = new URL(`${GHL_BASE}${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
  }

  let attempt = 0;
  for (;;) {
    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
        Version: GHL_VERSION,
        Accept: "application/json",
      },
    });
    if (res.ok) return (await res.json()) as T;

    // Rate limited or transient server error → backoff + retry.
    if ((res.status === 429 || res.status >= 500) && attempt < MAX_RETRIES) {
      const retryAfter = Number(res.headers.get("retry-after"));
      const waitMs = Number.isFinite(retryAfter)
        ? retryAfter * 1000
        : Math.min(8000, 500 * 2 ** attempt);
      attempt++;
      await sleep(waitMs);
      continue;
    }

    let detail = "";
    try {
      detail = JSON.stringify(await res.json());
    } catch {
      detail = res.statusText;
    }
    throw new GhlApiError(
      `GHL ${path} returned ${res.status}: ${detail}`.slice(0, 500),
      res.status,
    );
  }
}

export type GhlCursor = { startAfter?: string; startAfterId?: string } | null;

interface ContactsResponse {
  contacts?: GhlContact[];
  meta?: { startAfter?: string | number; startAfterId?: string; total?: number };
}

interface OpportunitiesResponse {
  opportunities?: GhlOpportunity[];
  meta?: { startAfter?: string | number; startAfterId?: string; total?: number };
}

export interface Page<T> {
  items: T[];
  next: GhlCursor;
  total: number | null;
}

function nextCursor(meta: ContactsResponse["meta"]): GhlCursor {
  if (!meta?.startAfterId && meta?.startAfter == null) return null;
  return {
    startAfter: meta?.startAfter != null ? String(meta.startAfter) : undefined,
    startAfterId: meta?.startAfterId,
  };
}

/**
 * One page of contacts. Pass the previous page's `next` to continue. `limit`
 * defaults to 100; the notes phase pages smaller so its per-contact note
 * fetches stay under the burst limit.
 */
export async function listContactsPage(
  token: string,
  locationId: string,
  cursor: GhlCursor = null,
  limit: number = PAGE_SIZE,
): Promise<Page<GhlContact>> {
  const data = await ghlFetch<ContactsResponse>(token, "/contacts/", {
    locationId,
    limit,
    startAfter: cursor?.startAfter,
    startAfterId: cursor?.startAfterId,
  });
  return {
    items: data.contacts ?? [],
    next: nextCursor(data.meta),
    total: data.meta?.total ?? null,
  };
}

/** All notes for one contact (small per contact; single page in practice). */
export async function listContactNotes(
  token: string,
  contactId: string,
): Promise<GhlNote[]> {
  const data = await ghlFetch<{ notes?: GhlNote[] }>(
    token,
    `/contacts/${contactId}/notes`,
  );
  // Stamp contactId so the transformer can set contact_external_id.
  return (data.notes ?? []).map((n) => ({ ...n, contactId }));
}

/** One page of opportunities. */
export async function listOpportunitiesPage(
  token: string,
  locationId: string,
  cursor: GhlCursor = null,
): Promise<Page<GhlOpportunity>> {
  const data = await ghlFetch<OpportunitiesResponse>(
    token,
    "/opportunities/search",
    {
      location_id: locationId,
      limit: PAGE_SIZE,
      startAfter: cursor?.startAfter,
      startAfterId: cursor?.startAfterId,
    },
  );
  return {
    items: data.opportunities ?? [],
    next: nextCursor(data.meta),
    total: data.meta?.total ?? null,
  };
}

export async function getPipelines(
  token: string,
  locationId: string,
): Promise<GhlPipeline[]> {
  const data = await ghlFetch<{ pipelines?: GhlPipeline[] }>(
    token,
    "/opportunities/pipelines",
    { locationId },
  );
  return data.pipelines ?? [];
}

export async function getCustomFields(
  token: string,
  locationId: string,
): Promise<GhlCustomFieldDef[]> {
  const data = await ghlFetch<{ customFields?: GhlCustomFieldDef[] }>(
    token,
    `/locations/${locationId}/customFields`,
  );
  return data.customFields ?? [];
}

/**
 * Validate a token + location by fetching a single contact page. Returns the
 * reported total when available (drives the preview step). Throws GhlApiError
 * (401/403) when the token is bad.
 */
export async function validateGhlAccess(
  token: string,
  locationId: string,
): Promise<{ ok: true; contactTotal: number | null }> {
  const page = await ghlFetch<ContactsResponse>(token, "/contacts/", {
    locationId,
    limit: 1,
  });
  return { ok: true, contactTotal: page.meta?.total ?? null };
}
