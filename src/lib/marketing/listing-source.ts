import type { IdxListingDoc, ListingMarketingStatus } from "@/types/idx";

/**
 * Shared vocabulary for the one inventory a sub-account has.
 *
 * On-market and off-market property already live in the same collection
 * (`subAccounts/{id}/idxListings`): the sync job writes feed listings, and
 * guided manual entry writes everything else via `buildManualListing()`. What
 * was missing is a single place that says how to LABEL them, so the Listings
 * browser, the properties list, and the campaign composer describe the same
 * record the same way instead of each inventing its own wording.
 *
 * The distinction is not cosmetic. A feed listing carries MLS display rights
 * and a `disclaimer` that must render verbatim; a manually-entered off-market
 * property carries neither. Any surface that can push a property outward has
 * to be able to tell them apart, which is what `isFeedSourced` is for.
 */

export type ListingSourceKey = "mls" | "manual" | "imported" | "none";

export interface ListingSource {
  key: ListingSourceKey;
  /** Operator-facing label. Plain nouns — never "IDX record" or other vendor jargon. */
  label: string;
  /**
   * True only for records the IDX sync job wrote. Gates anything that depends
   * on MLS display rights or the verbatim `disclaimer`.
   */
  isFeedSourced: boolean;
}

const SOURCES: Record<ListingSourceKey, ListingSource> = {
  mls: { key: "mls", label: "MLS feed", isFeedSourced: true },
  manual: { key: "manual", label: "Added manually", isFeedSourced: false },
  imported: { key: "imported", label: "Imported", isFeedSourced: false },
  none: { key: "none", label: "No property record", isFeedSourced: false },
};

/**
 * Where a listing came from, read off the record itself.
 *
 * `raw.importedFrom` is the discriminator the campaigns route already stamps
 * ("guided manual entry" for the off-market path, a source name for file
 * imports). Its absence means the sync job wrote the doc, because nothing
 * else writes to this collection without stamping the field.
 */
export function describeListingSource(
  // Deliberately loose: callers hold a full `IdxListingDoc` in some places and
  // an untyped Firestore payload in others. The body validates `raw` anyway,
  // so widening here beats making every caller cast.
  listing: { raw?: unknown } | null | undefined
): ListingSource {
  if (!listing) return SOURCES.none;
  const raw = listing.raw;
  const importedFrom =
    typeof raw === "object" &&
    raw !== null &&
    typeof (raw as { importedFrom?: unknown }).importedFrom === "string"
      ? (raw as { importedFrom: string }).importedFrom
      : null;
  if (!importedFrom) return SOURCES.mls;
  return importedFrom === "guided manual entry"
    ? SOURCES.manual
    : SOURCES.imported;
}

/**
 * `marketingStatus` is the operator-facing lifecycle; `status` is what the
 * feed reports. Older docs predate `marketingStatus` entirely, so derive it
 * rather than showing them all as one bucket — an inventory screen that
 * silently files every legacy record under "Active" is lying about what is
 * actually on the market.
 */
export function resolveMarketingStatus(
  // Loose for the same reason as `describeListingSource` — some callers hold a
  // typed doc, others an untyped Firestore payload.
  listing: { status?: unknown; marketingStatus?: unknown }
): ListingMarketingStatus {
  if (isMarketingStatus(listing.marketingStatus))
    return listing.marketingStatus;
  switch (listing.status) {
    case "pending":
      return "under-contract";
    case "sold":
      return "just-sold";
    case "off-market":
      return "off-market";
    default:
      return "active";
  }
}

/**
 * The inverse mapping, for writes. Kept here rather than in the status route
 * so guided manual entry and the status PATCH cannot drift apart on what
 * "under contract" means to the feed-shaped `status` field.
 */
export const MARKETING_STATUS_TO_IDX_STATUS: Record<
  ListingMarketingStatus,
  IdxListingDoc["status"]
> = {
  new: "active",
  active: "active",
  "under-contract": "pending",
  "just-sold": "sold",
  "off-market": "off-market",
};

export const MARKETING_STATUSES = Object.keys(
  MARKETING_STATUS_TO_IDX_STATUS
) as ListingMarketingStatus[];

export function isMarketingStatus(
  value: unknown
): value is ListingMarketingStatus {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(MARKETING_STATUS_TO_IDX_STATUS, value)
  );
}

export const MARKETING_STATUS_LABELS: Record<ListingMarketingStatus, string> = {
  new: "New",
  active: "Active",
  "under-contract": "Under contract",
  "just-sold": "Just sold",
  "off-market": "Off market",
};
