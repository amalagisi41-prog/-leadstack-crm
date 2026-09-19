import type { ListingInquiryStat } from "@/types/listing-inquiries";

/**
 * Fold inquiry rows into one stat per listing.
 *
 * Pure and transport-free so it can be tested without Firestore, and so the
 * route stays a thin wrapper around a query. Timestamps arrive in whatever
 * shape the caller has — a Firestore Timestamp, a Date, or epoch millis — so
 * this normalises rather than assuming.
 */

/** The subset of an inquiry row this needs. */
export interface InquiryRowInput {
  listingId?: unknown;
  createdAt?: unknown;
}

/**
 * Epoch millis from whatever a Firestore read handed us, or null.
 *
 * `null` means "no usable date", never "now" — a row whose timestamp has not
 * materialised yet (a server timestamp read back in the same tick) must not
 * be reported as the most recent inquiry, because that would make a rollup
 * claim activity that may have happened at any time.
 */
export function inquiryTimeMs(value: unknown): number | null {
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (
    typeof value === "object" &&
    value !== null &&
    "toDate" in value &&
    typeof (value as { toDate: unknown }).toDate === "function"
  ) {
    try {
      const date = (value as { toDate: () => Date }).toDate();
      const ms = date.getTime();
      return Number.isFinite(ms) ? ms : null;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * One entry per listing that has at least one inquiry. Listings with none are
 * absent rather than present with a zero — the caller decides whether "no
 * inquiries yet" is worth showing, and an absent key cannot be mistaken for a
 * measured zero if the query failed.
 */
export function summariseListingInquiries(
  rows: readonly InquiryRowInput[]
): Record<string, ListingInquiryStat> {
  const out: Record<string, ListingInquiryStat> = {};
  for (const row of rows) {
    const listingId =
      typeof row.listingId === "string" ? row.listingId.trim() : "";
    if (!listingId) continue;

    const at = inquiryTimeMs(row.createdAt);
    const existing = out[listingId];
    if (!existing) {
      out[listingId] = { count: 1, lastAt: at };
      continue;
    }
    existing.count += 1;
    // A row with no usable date still counts toward the total; it just cannot
    // move the "most recent" marker.
    if (at !== null && (existing.lastAt === null || at > existing.lastAt)) {
      existing.lastAt = at;
    }
  }
  return out;
}
