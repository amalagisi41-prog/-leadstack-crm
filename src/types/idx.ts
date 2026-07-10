import type { FieldValue, Timestamp } from "firebase/firestore";

/**
 * A single synced MLS listing, stored at
 * `subAccounts/{id}/idxListings/{listingId}` (doc id = IDX Broker's own
 * listingID, so a resync naturally upserts instead of duplicating). Populated
 * by the scheduled sync job (`/api/idx/sync/step`) — never written by a
 * client. Public search/detail pages + the operator's dashboard browser both
 * read from this cached copy; nothing proxies live to IDX Broker per visitor.
 *
 * Exact field names below are the target normalized shape — IDX Broker's
 * actual response fields are confirmed against a live account during
 * implementation and mapped into this shape by the sync step. `raw` keeps the
 * full vendor payload so nothing is lost if a normalized field turns out to
 * be missing or misnamed on day one.
 */
export interface IdxListingDoc {
  id: string;
  subAccountId: string;
  mlsId: string;
  /**
   * Normalized from whatever status IDX Broker reports. "off-market" is our
   * own bucket for a listing the last sync no longer saw — the sync job
   * flips stale listings to this instead of deleting them, so a bookmarked
   * detail-page URL doesn't 404 while the listing still drops out of search.
   */
  status: "active" | "pending" | "sold" | "off-market";
  price: number;
  address: string;
  city: string;
  state: string;
  zip: string;
  beds: number;
  baths: number;
  sqft: number | null;
  yearBuilt: number | null;
  propertyType: string;
  photos: string[];
  remarks: string;
  listingAgentName: string | null;
  listingOfficeName: string | null;
  /** MLS-required attribution/disclaimer text — render verbatim, never edit or omit. */
  disclaimer: string | null;
  lat: number | null;
  lng: number | null;
  /** Full vendor payload, for fields the normalized shape above doesn't cover yet. */
  raw: Record<string, unknown>;
  syncedAt: Timestamp | FieldValue;
}
