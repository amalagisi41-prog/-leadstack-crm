import type { FieldValue, Timestamp } from "firebase/firestore";

/**
 * One of a sub-account's public listings pages, kept in sync into
 * `idxListings`.
 *
 * A sub-account can connect any number of these — a brokerage-affiliated
 * agent may have their own site's listings page AND a page on the
 * brokerage's site, for instance. Stored at
 * `subAccounts/{id}/listingsImportSources/{sourceId}`, where `sourceId` is
 * derived from the URL itself (see `lib/marketing/listing-dedupe.ts`'s
 * `stableListingId`, reused here) so connecting the same URL twice updates
 * the existing source instead of creating a duplicate connection.
 *
 * Firecrawl scrapes the URL, a parser turns each property card into an
 * `IdxListingDoc` upsert (see `lib/marketing/listings-scrape.ts`), keyed by
 * a deterministic id derived from the property's OWN address so a re-sync
 * updates the same listing record regardless of which source (or how many
 * sources) it came from.
 */
export interface ListingsImportSourceDoc {
  url: string;
  status: "pending" | "processing" | "ready" | "failed";
  errorMessage: string | null;
  lastSyncedAt: Timestamp | FieldValue | null;
  propertyCount: number;
  createdAt: Timestamp | FieldValue;
  updatedAt: Timestamp | FieldValue;
}

/**
 * The wire shape sent to the client. Firestore Admin `Timestamp` fields
 * don't survive `NextResponse.json()` as anything usable (they serialize to
 * a raw `{_seconds,_nanoseconds}` object, not an ISO string) — routes must
 * convert `lastSyncedAt` to epoch milliseconds before responding, which is
 * what `serializeListingsImportSource()` in
 * `lib/marketing/listings-source-sync.ts` does.
 */
export interface ListingsImportSourceClient {
  id: string;
  url: string;
  status: "pending" | "processing" | "ready" | "failed";
  errorMessage: string | null;
  lastSyncedAt: number | null;
  propertyCount: number;
}
