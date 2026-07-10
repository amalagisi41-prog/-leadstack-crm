import "server-only";

/**
 * Thin client for the IDX Broker Platinum API. Each realtor brings their own
 * IDX Broker account + access key — we never provision or resell accounts.
 *
 * IMPORTANT — needs live-account verification: the exact search endpoint
 * path, its parameters, and the shape of a listing record can vary by IDX
 * Broker account tier and by which fields the underlying MLS approves for
 * IDX display. The auth header shape below (`accesskey` + `outputtype:
 * json`) and base URL are IDX Broker's documented convention; the search
 * endpoint + field names should be confirmed/adjusted against a real,
 * connected account before relying on this in production. `rawFields` on
 * each returned listing preserves whatever IDX Broker actually sent so nulls
 * in the normalized shape are recoverable without a re-sync.
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
  const data = (await res.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (!data) return [];
  return Object.keys(data);
}

/**
 * Fetches one page of active listings for the given MLS. IDX Broker's own
 * per-account rate limits mean this should only ever be called from the
 * scheduled sync job or an explicit "Sync now" click — never per public
 * visitor request.
 */
export async function fetchIdxListings(
  accessKey: string,
  mlsId: string,
): Promise<IdxBrokerRawListing[]> {
  const res = await fetch(`${BASE_URL}/mls/search/${mlsId}`, {
    headers: authHeaders(accessKey),
  });
  if (res.status === 204) return []; // IDX Broker's "no results" response
  if (!res.ok) {
    throw new IdxBrokerError(
      `IDX Broker search failed (HTTP ${res.status}).`,
      res.status,
    );
  }
  const data = (await res.json().catch(() => null)) as
    | IdxBrokerRawListing[]
    | Record<string, IdxBrokerRawListing>
    | null;
  if (!data) return [];
  return Array.isArray(data) ? data : Object.values(data);
}
