/**
 * One record per inquiry made on a public listing page.
 *
 * The inquiry route already wrote an activity row carrying
 * `meta: { listingId }` onto the contact — but activities live in a
 * subcollection that carries no tenancy key, so counting them per listing
 * would mean an unscoped collection-group query across every agency's
 * contacts. That is not a query this codebase should have.
 *
 * So the inquiry is also recorded here: a flat, tenancy-keyed collection in
 * the same shape as `products` and `socialPosts`. One row per inquiry, not
 * per contact, because the same person asking about three properties is three
 * pieces of interest and collapsing them would undercount the two listings
 * that came second.
 *
 * This is an analytics record, not a ledger. Nothing bills from it and no
 * workflow branches on it, which is why the route writes it best-effort and a
 * failed write is logged rather than shown to the visitor.
 */
export interface ListingInquiryDoc {
  id: string;
  agencyId: string;
  subAccountId: string;
  /** The `idxListings` doc id the inquiry was made against. */
  listingId: string;
  /** Snapshot, so a rollup reads without loading the listing. */
  listingAddress: string;
  /** The contact the inquiry reconciled to — new or existing. */
  contactId: string;
  createdAt: unknown;
}

/** What a rollup shows for one listing. */
export interface ListingInquiryStat {
  count: number;
  /** Epoch ms of the most recent inquiry, or null if somehow absent. */
  lastAt: number | null;
}
