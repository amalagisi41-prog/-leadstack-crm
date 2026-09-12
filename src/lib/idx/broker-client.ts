import "server-only";

/**
 * Thin client for the IDX Broker Platinum API. Each realtor brings their own
 * IDX Broker account + access key — we never provision or resell accounts.
 *
 * This client intentionally uses IDX Broker's featured-listings API. IDX
 * Broker does not expose MLS-wide listing search through this API; featured
 * listings are the supported listing-data exception for the agents on the
 * connected account. `raw` on each normalized listing preserves the source
 * response so fields outside our normalized shape remain recoverable.
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
  [key: string]: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function listingIdentifier(value: Record<string, unknown>): string | null {
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
  const res = await fetch(`${BASE_URL}/mls/approvedmls`, {
    headers: authHeaders(accessKey),
  });
  if (!res.ok) {
    throw new IdxBrokerError(
      `IDX Broker rejected the access key (HTTP ${res.status}).`,
      res.status,
    );
  }
  const data = (await res.json().catch(() => null)) as unknown;
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

/**
 * Fetches the connected account's featured listings. IDX Broker's own
 * per-account rate limits mean this should only ever be called from the
 * scheduled sync job or an explicit "Sync now" click — never per public
 * visitor request.
 */
export async function fetchIdxListings(
  accessKey: string,
): Promise<IdxBrokerRawListing[]> {
  const res = await fetch(`${BASE_URL}/clients/featured`, {
    headers: authHeaders(accessKey),
  });
  if (res.status === 204) return [];
  if (!res.ok) {
    throw new IdxBrokerError(
      `IDX Broker featured listings request failed (HTTP ${res.status}).`,
      res.status,
    );
  }
  const data = (await res.json().catch(() => null)) as unknown;
  return extractListingRecords(data);
}
