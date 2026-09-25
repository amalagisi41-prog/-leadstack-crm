import "server-only";

/**
 * Thin client for the IDX Broker Platinum API. Each realtor brings their own
 * IDX Broker account + access key — we never provision or resell accounts.
 *
 * IDX Broker's "Featured" endpoint alone is not a full listings feed: its
 * result set is controlled by the connected account's Featured IDs
 * configuration in IDX Broker's own dashboard, not by MLS board or agent. An
 * account can be fully authorized for an MLS and still return zero Featured
 * listings if nothing there has been marked Featured. `syncIdxListings()` in
 * `lib/idx/sync.ts` therefore fans out across several client-scoped sources
 * (Featured, an agent-filtered Featured request, saved-link results,
 * Supplemental) and merges them — this module is the low-level client each
 * of those calls goes through. `raw` on each normalized listing preserves
 * the source response so fields outside our normalized shape remain
 * recoverable.
 *
 * Every call is logged (endpoint, HTTP status, extracted listing count, and
 * a 300-char body preview) so a sync that comes back empty is diagnosable
 * from server logs alone, without needing to reproduce it. A `204` is
 * IDX Broker's documented "no content" response and is treated as zero
 * listings on purpose; any other non-2xx status, or a 2xx response whose
 * body doesn't parse as JSON, is a real failure and throws — it must never
 * quietly collapse into `listingCount: 0` the way an intentional 204 does.
 */

const BASE_URL = "https://api.idxbroker.com";

export class IdxBrokerError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "IdxBrokerError";
    this.status = status;
  }
}

function authHeaders(accessKey: string): HeadersInit {
  return {
    accesskey: accessKey,
    outputtype: "json",
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

// ---------------------------------------------------------------------------
// Low-level fetch + logging
// ---------------------------------------------------------------------------

interface IdxFetchResult {
  status: number;
  ok: boolean;
  /** First 300 chars of the raw response body, for logs and diagnostics. */
  bodyPreview: string;
  /** Parsed JSON body, or `null` when the response had no body (e.g. 204). */
  data: unknown;
  /** True when the response had a body that failed to parse as JSON. */
  parseError: boolean;
}

async function idxFetch(
  endpoint: string,
  accessKey: string,
  query?: Record<string, string>,
): Promise<IdxFetchResult> {
  const url = new URL(`${BASE_URL}${endpoint}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value) url.searchParams.set(key, value);
    }
  }
  const res = await fetch(url.toString(), { headers: authHeaders(accessKey) });
  const bodyText = res.status === 204 ? "" : await res.text().catch(() => "");
  let data: unknown = null;
  let parseError = false;
  if (bodyText) {
    try {
      data = JSON.parse(bodyText);
    } catch {
      parseError = true;
    }
  }
  const bodyPreview = bodyText.slice(0, 300);
  console.log(
    `[idx] ${url.pathname}${url.search} status=${res.status} ok=${res.ok} parseError=${parseError} bodyPreview=${JSON.stringify(bodyPreview)}`,
  );
  return { status: res.status, ok: res.ok, bodyPreview, data, parseError };
}

/**
 * Turns a low-level fetch result into a listing array, applying the shared
 * "204 is intentionally empty, everything else non-2xx or unparseable is a
 * real failure" rule every listing-shaped endpoint below follows.
 */
function recordsFromListingResult(
  result: IdxFetchResult,
  endpoint: string,
): IdxBrokerRawListing[] {
  if (result.status === 204) return [];
  if (!result.ok) {
    throw new IdxBrokerError(
      `IDX Broker ${endpoint} request failed (HTTP ${result.status}).`,
      result.status,
    );
  }
  if (result.parseError) {
    throw new IdxBrokerError(
      `IDX Broker ${endpoint} returned a response that wasn't valid JSON (HTTP ${result.status}).`,
      result.status,
    );
  }
  return extractListingRecords(result.data);
}

export interface IdxBrokerRawListing {
  listingID?: string;
  listingPrice?: string | number;
  address?: string;
  cityName?: string;
  state?: string;
  zipcode?: string;
  bedrooms?: string | number;
  totalBaths?: string | number;
  sqFt?: string | number;
  yearBuilt?: string | number;
  propType?: string;
  image?: { url?: string }[] | string[];
  remarksConcat?: string;
  listingAgentName?: string;
  officeName?: string;
  disclaimer?: string;
  latitude?: string | number;
  longitude?: string | number;
  idxStatus?: string;
  idxID?: string;
  [key: string]: unknown;
}

export function listingIdentifier(value: Record<string, unknown>): string | null {
  for (const key of [
    "listingID",
    "listingId",
    "listingNumber",
    "listing_number",
    "mlsNumber",
    "mlsID",
    "mlsId",
    "mls",
  ]) {
    const candidate = value[key];
    if (typeof candidate === "string" || typeof candidate === "number") {
      const id = String(candidate).trim();
      if (id) return id;
    }
  }
  return null;
}

/** Accept the object-map, array, and envelope shapes returned by IDX exports. */
function extractListingRecords(data: unknown): IdxBrokerRawListing[] {
  if (Array.isArray(data)) {
    return data.filter(isRecord).filter((value) => listingIdentifier(value));
  }
  if (!isRecord(data)) return [];

  for (const key of ["listings", "results", "data", "featuredListings"]) {
    if (key in data) {
      const nested = extractListingRecords(data[key]);
      if (nested.length > 0) return nested;
    }
  }

  return Object.values(data)
    .filter(isRecord)
    .filter((value) => listingIdentifier(value));
}

/** Accept the array, `{results:[...]}`/`{data:[...]}`, and object-map shapes for non-listing record lists (agents, saved links). */
function extractRecordList(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) return data.filter(isRecord);
  if (!isRecord(data)) return [];
  for (const key of ["agents", "savedLinks", "results", "data"]) {
    const nested = data[key];
    if (Array.isArray(nested)) return nested.filter(isRecord);
  }
  return Object.values(data).filter(isRecord);
}

function toMlsId(value: unknown): string | null {
  if (typeof value === "string" || typeof value === "number") {
    const id = String(value).trim();
    return id.length > 0 ? id : null;
  }
  if (!value || typeof value !== "object") return null;

  const record = value as Record<string, unknown>;
  for (const key of ["mlsId", "mlsID", "id", "value"]) {
    const id = toMlsId(record[key]);
    if (id) return id;
  }
  return null;
}

/**
 * Verifies the access key can reach the account and returns the MLSs it's
 * approved to search — used both as a lightweight connection check and to
 * default `mlsId` when the operator doesn't pick one explicitly.
 */
export async function fetchApprovedMlsIds(
  accessKey: string,
): Promise<string[]> {
  const result = await idxFetch("/mls/approvedmls", accessKey);
  if (result.status === 204) return [];
  if (!result.ok) {
    throw new IdxBrokerError(
      `IDX Broker rejected the access key (HTTP ${result.status}).`,
      result.status,
    );
  }
  if (result.parseError) {
    throw new IdxBrokerError(
      `IDX Broker /mls/approvedmls returned a response that wasn't valid JSON (HTTP ${result.status}).`,
      result.status,
    );
  }
  const data = result.data;
  if (!data) return [];
  if (Array.isArray(data)) {
    return data.map(toMlsId).filter((value): value is string => value !== null);
  }
  if (typeof data !== "object") return [];

  const entries = Object.entries(data);
  // IDX Broker has returned both `{ "22904": "SmartMLS" }` and
  // `["22904"]`-shaped payloads across API versions. Never expose an array
  // index such as `"0"` as an MLS ID when the response is index-keyed.
  if (entries.every(([key]) => /^\d+$/.test(key))) {
    const indexedIds = entries
      .map(([, value]) => toMlsId(value))
      .filter((value): value is string => value !== null);
    if (indexedIds.length === entries.length) return indexedIds;
  }
  return entries.map(([key]) => key);
}

export interface IdxAccountInfo {
  accountId: string | null;
  accountName: string | null;
  raw: Record<string, unknown> | null;
}

/**
 * Identifies the IDX Broker account behind an access key. Field names for
 * this endpoint aren't fully pinned down across every IDX Broker account
 * tier, so this reads defensively across the common aliases and always
 * keeps `raw` — Settings can show whatever the account actually returned
 * even if none of the named fields below match, so the operator can
 * self-verify it's the account they expect rather than the app guessing.
 */
export async function fetchAccountInfo(accessKey: string): Promise<IdxAccountInfo> {
  const result = await idxFetch("/clients/accountinfo", accessKey);
  if (result.status === 204) return { accountId: null, accountName: null, raw: null };
  if (!result.ok) {
    throw new IdxBrokerError(
      `IDX Broker account info request failed (HTTP ${result.status}).`,
      result.status,
    );
  }
  if (result.parseError || !isRecord(result.data)) {
    throw new IdxBrokerError(
      `IDX Broker account info returned a response that wasn't valid JSON (HTTP ${result.status}).`,
      result.status,
    );
  }
  const record = result.data;
  return {
    accountId: asString(record.accountID ?? record.accountId ?? record.id),
    accountName: asString(
      record.accountName ?? record.name ?? record.companyName ?? record.office,
    ),
    raw: record,
  };
}

export interface IdxAgent {
  agentId: string | null;
  /** The MLS-issued agent id, if IDX Broker reports one — this is what filters listings by agent, not `agentId`. */
  agentMlsId: string | null;
  name: string | null;
  raw: Record<string, unknown>;
}

/** Lists the agents on this IDX Broker account. */
export async function fetchAgents(accessKey: string): Promise<IdxAgent[]> {
  const result = await idxFetch("/clients/agents", accessKey);
  if (result.status === 204) return [];
  if (!result.ok) {
    throw new IdxBrokerError(
      `IDX Broker agents request failed (HTTP ${result.status}).`,
      result.status,
    );
  }
  if (result.parseError) {
    throw new IdxBrokerError(
      `IDX Broker agents returned a response that wasn't valid JSON (HTTP ${result.status}).`,
      result.status,
    );
  }
  return extractRecordList(result.data).map((record) => ({
    agentId: asString(record.agentID ?? record.agentId ?? record.id),
    agentMlsId: asString(
      record.agentMLSID ?? record.agentMlsId ?? record.mlsAgentID ?? record.mlsAgentId,
    ),
    name: asString(record.agentName ?? record.name ?? record.displayName),
    raw: record,
  }));
}

/**
 * Fetches the connected account's featured listings. IDX Broker's own
 * per-account rate limits mean this should only ever be called from the
 * scheduled sync job or an explicit "Sync now" click — never per public
 * visitor request.
 *
 * `intervalHours` filters to listings modified within that many hours
 * (IDX Broker's `interval` parameter on this endpoint is hours, not days —
 * 8765 is deliberately "about a year"). `agentMlsId` narrows Featured to one
 * agent's MLS id; unset by default since most Featured configs aren't
 * agent-scoped.
 */
export async function fetchIdxListings(
  accessKey: string,
  opts?: { intervalHours?: number; agentMlsId?: string },
): Promise<IdxBrokerRawListing[]> {
  const query: Record<string, string> = {};
  if (opts?.intervalHours) query.interval = String(opts.intervalHours);
  if (opts?.agentMlsId) query.agentID = opts.agentMlsId;
  const result = await idxFetch("/clients/featured", accessKey, query);
  return recordsFromListingResult(result, "featured listings");
}

/** Listings the agent added by hand outside the MLS feed (off-MLS pocket listings, etc). */
export async function fetchSupplementalListings(
  accessKey: string,
): Promise<IdxBrokerRawListing[]> {
  const result = await idxFetch("/clients/supplemental", accessKey);
  return recordsFromListingResult(result, "supplemental listings");
}

export interface IdxSavedLink {
  id: string | null;
  name: string | null;
  url: string | null;
  raw: Record<string, unknown>;
}

/** Lists the account's saved searches ("MyIDX" links) configured in IDX Broker. */
export async function fetchSavedLinks(accessKey: string): Promise<IdxSavedLink[]> {
  const result = await idxFetch("/clients/savedlinks", accessKey);
  if (result.status === 204) return [];
  if (!result.ok) {
    throw new IdxBrokerError(
      `IDX Broker saved links request failed (HTTP ${result.status}).`,
      result.status,
    );
  }
  if (result.parseError) {
    throw new IdxBrokerError(
      `IDX Broker saved links returned a response that wasn't valid JSON (HTTP ${result.status}).`,
      result.status,
    );
  }
  return extractRecordList(result.data).map((record) => ({
    id: asString(record.id ?? record.linkID ?? record.savedLinkID),
    name: asString(record.name ?? record.linkName ?? record.title),
    url: asString(record.url ?? record.link),
    raw: record,
  }));
}

/**
 * IDX Broker's Clients API v1.1 does not document a separate JSON endpoint
 * for pulling a saved link's matching listings the way Featured and
 * Supplemental are documented — and this environment could not reach
 * middleware.idxbroker.com to confirm one exists (egress-blocked at
 * implementation time). Rather than guess an unverified endpoint path and
 * risk silently mis-parsing whatever it returns as "zero listings" (the
 * exact failure this fix exists to close), this reuses the same generic
 * listing extractor against the saved-link record itself, in case the
 * account's response embeds matching listing data inline. If IDX Broker's
 * actual behavior differs, this correctly returns zero for that source
 * without corrupting anything else, and the per-source breakdown
 * (`lib/idx/sync.ts`) will show `savedLink: 0` so a human can check the
 * logged raw response and confirm the real shape.
 *
 * TODO: verify against https://middleware.idxbroker.com/docs/api/1.1/clients.php
 * once reachable, and replace with the confirmed endpoint if one exists.
 */
export function extractListingsFromSavedLink(
  link: IdxSavedLink,
): IdxBrokerRawListing[] {
  return extractListingRecords(link.raw);
}
