import { listingSlug } from "@/lib/idx/listing-slug";
import {
  MARKETING_STATUS_LABELS,
  resolveMarketingStatus,
} from "@/lib/marketing/listing-source";
import type { AgentSiteListing } from "@/types/agent-site";
import type { IdxListingDoc } from "@/types/idx";

/**
 * Featured-listing cards on a published agent site, resolved against the
 * workspace's real inventory.
 *
 * A card used to be five free-text strings typed into the Website Studio
 * editor with no link back to any property record. That is the same shape as
 * hand-maintained listing cards on a WordPress site, and it drifts the same
 * way: the MLS feed re-syncs every few hours, the typed card changes when
 * somebody remembers. A card still showing "For Sale" on a property that
 * closed last week is a compliance problem, not just an embarrassment.
 *
 * So a card may now carry `listingId`. When it does, the published page
 * renders the live record — price, status, photo — and links to that
 * property's own page. The typed fields stay on the doc as a SNAPSHOT and are
 * what renders if the listing is later deleted, so removing a listing degrades
 * the card instead of blanking it.
 */

/** Where a referenced listing's own public page lives. */
export function listingPublicPath(
  subAccountId: string,
  listing: Pick<IdxListingDoc, "address" | "city">
): string {
  return `/idx/${subAccountId}/property/${listingSlug(listing.address, listing.city)}`;
}

/**
 * Project a listing into the card shape. Used to seed a card when the agent
 * picks a property in the editor (so the snapshot is populated) and to refresh
 * it at render time.
 *
 * Deliberately does NOT set `href`. This is the shape that gets persisted, and
 * `href` is derived — storing it would bake today's slug into the document and
 * go stale the moment the address is corrected. `hydrateSiteListings()` adds
 * it at render.
 */
export function listingToSiteCard(listing: IdxListingDoc): AgentSiteListing {
  return {
    listingId: listing.id,
    title: listing.address || "Property",
    price: listing.price ? `$${listing.price.toLocaleString()}` : "",
    location: [listing.city, listing.state].filter(Boolean).join(", "),
    imageUrl: listing.photos?.[0] ?? "",
    status: MARKETING_STATUS_LABELS[resolveMarketingStatus(listing)],
  };
}

/**
 * Refresh every referenced card against the listings that were loaded for the
 * page, leaving hand-typed cards untouched.
 *
 * A reference whose listing is missing keeps its stored snapshot and loses its
 * link — the honest outcome, since we can no longer confirm what that property
 * is doing. Cards with no `listingId` pass through unchanged, which is what
 * keeps every site built before this existed rendering exactly as it did.
 */
export function hydrateSiteListings(
  cards: AgentSiteListing[],
  listingsById: Map<string, IdxListingDoc>,
  subAccountId: string
): AgentSiteListing[] {
  return cards.map((card) => {
    if (!card.listingId) return card;
    const listing = listingsById.get(card.listingId);
    if (!listing) return { ...card, href: undefined };
    const live = listingToSiteCard(listing);
    return {
      ...live,
      href: listingPublicPath(subAccountId, listing),
      // An empty live field falls back to the snapshot rather than rendering a
      // blank card — a feed row missing photos should not wipe the image the
      // agent chose.
      title: live.title || card.title,
      price: live.price || card.price,
      location: live.location || card.location,
      imageUrl: live.imageUrl || card.imageUrl,
    };
  });
}

/** The listing ids a site's cards reference, for a batched read. */
export function referencedListingIds(cards: AgentSiteListing[]): string[] {
  return [
    ...new Set(
      cards
        .map((card) => card.listingId)
        .filter((id): id is string => typeof id === "string" && id.length > 0)
    ),
  ];
}
