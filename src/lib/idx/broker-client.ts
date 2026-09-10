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
    return data
      .map((value) => String(value).trim())
      .filter((value) => value.length > 0);
  }
  if (typeof data !== "object") return [];

  const entries = Object.entries(data);
  // IDX Broker has returned both `{ "22904": "SmartMLS" }` and
  // `["22904"]`-shaped payloads across API versions. Never expose an array
  // index such as `"0"` as an MLS ID when the response is index-keyed.
  return entries.every(([key]) => /^\d+$/.test(key))
    ? entries.map(([, value]) => String(value).trim()).filter(Boolean)
    : entries.map(([key]) => key);
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
  const data = (await res.json().catch(() => null)) as
    | Record<string, IdxBrokerRawListing | unknown>
    | null;
  if (!data) return [];
  return Object.values(data).filter(
    (value): value is IdxBrokerRawListing =>
      typeof value === "object" &&
      value !== null &&
      "listingID" in value,
  );
}
