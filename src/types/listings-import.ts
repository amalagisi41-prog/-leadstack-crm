import type { FieldValue, Timestamp } from "firebase/firestore";

/**
 * A sub-account's public listings page, kept in sync into `idxListings`.
 *
 * One singleton per sub-account at `subAccounts/{id}/listingsImportSource/main`
 * — an agent has exactly one "my own site's listings page" to point at, same
 * shape as the AI Agent's `aiAgent/profile` singleton. Firecrawl scrapes the
 * URL, a parser turns each property card into an `IdxListingDoc` upsert (see
 * `lib/marketing/listings-scrape.ts`), keyed by a deterministic id derived
 * from the property's address so a re-sync updates the same record instead
 * of piling up duplicates (see `lib/marketing/listing-dedupe.ts`).
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
  url: string;
  status: "pending" | "processing" | "ready" | "failed";
  errorMessage: string | null;
  lastSyncedAt: number | null;
  propertyCount: number;
}
