import { describe, expect, it } from "vitest";
import {
  hydrateSiteListings,
  listingPublicPath,
  listingToSiteCard,
  referencedListingIds,
} from "./listing-cards";
import type { AgentSiteListing } from "@/types/agent-site";
import type { IdxListingDoc } from "@/types/idx";

const SA = "sub-1";

function listing(over: Partial<IdxListingDoc> = {}): IdxListingDoc {
  return {
    id: "L1",
    subAccountId: SA,
    mlsId: "1234",
    status: "active",
    price: 749000,
    address: "12 Example St",
    city: "Testville",
    state: "CT",
    zip: "06902",
    beds: 3,
    baths: 2,
    sqft: 1800,
    yearBuilt: 1990,
    propertyType: "home",
    photos: ["https://example.com/a.jpg"],
    remarks: "",
    listingAgentName: null,
    listingOfficeName: null,
    disclaimer: null,
    lat: null,
    lng: null,
    raw: {},
    syncedAt: new Date() as never,
    ...over,
  };
}

const TYPED: AgentSiteListing = {
  title: "Hand typed",
  price: "$1",
  location: "Nowhere",
  imageUrl: "https://example.com/typed.jpg",
  status: "For Sale",
};

describe("listingToSiteCard", () => {
  it("projects the live record and keeps the reference", () => {
    expect(listingToSiteCard(listing())).toEqual({
      listingId: "L1",
      title: "12 Example St",
      price: "$749,000",
      location: "Testville, CT",
      imageUrl: "https://example.com/a.jpg",
      status: "Active",
    });
  });

  it("uses the operator lifecycle, not the raw feed status", () => {
    expect(
      listingToSiteCard(
        listing({ status: "sold", marketingStatus: "just-sold" })
      ).status
    ).toBe("Just sold");
  });

  it("never stores href — it is derived, and a stored slug goes stale", () => {
    expect(listingToSiteCard(listing())).not.toHaveProperty("href");
  });

  it("degrades rather than renders junk when the feed omits fields", () => {
    const card = listingToSiteCard(listing({ price: 0, photos: [] }));
    expect(card.price).toBe("");
    expect(card.imageUrl).toBe("");
  });
});

describe("hydrateSiteListings", () => {
  it("leaves hand-typed cards completely alone", () => {
    // Every site built before references existed is made of these.
    expect(hydrateSiteListings([TYPED], new Map(), SA)).toEqual([TYPED]);
  });

  it("refreshes a referenced card from the live record and links it", () => {
    const stale: AgentSiteListing = {
      listingId: "L1",
      title: "12 Example St",
      price: "$999,000",
      location: "Testville, CT",
      imageUrl: "https://example.com/old.jpg",
      status: "For Sale",
    };
    const [card] = hydrateSiteListings(
      [stale],
      new Map([["L1", listing({ marketingStatus: "under-contract" })]]),
      SA
    );
    expect(card.price).toBe("$749,000");
    expect(card.status).toBe("Under contract");
    expect(card.href).toBe("/idx/sub-1/property/12-example-st-testville");
  });

  it("keeps the snapshot and drops the link when the listing is gone", () => {
    // Deleting a property should degrade the card, never blank it — and never
    // leave a link to a page that will 404.
    const [card] = hydrateSiteListings(
      [{ ...TYPED, listingId: "missing" }],
      new Map(),
      SA
    );
    expect(card.title).toBe("Hand typed");
    expect(card.href).toBeUndefined();
  });

  it("falls back to the snapshot for fields the live record lacks", () => {
    const [card] = hydrateSiteListings(
      [{ ...TYPED, listingId: "L1" }],
      new Map([["L1", listing({ photos: [], price: 0 })]]),
      SA
    );
    expect(card.imageUrl).toBe("https://example.com/typed.jpg");
    expect(card.price).toBe("$1");
    // The reference still resolved, so the link stands.
    expect(card.href).toBe("/idx/sub-1/property/12-example-st-testville");
  });
});

describe("referencedListingIds", () => {
  it("returns each referenced id once and ignores typed cards", () => {
    expect(
      referencedListingIds([
        TYPED,
        { ...TYPED, listingId: "A" },
        { ...TYPED, listingId: "A" },
        { ...TYPED, listingId: "B" },
        { ...TYPED, listingId: "" },
      ])
    ).toEqual(["A", "B"]);
  });

  it("returns nothing when no card references anything", () => {
    // The caller skips the Firestore read entirely on an empty result.
    expect(referencedListingIds([TYPED])).toEqual([]);
  });
});

describe("listingPublicPath", () => {
  it("matches the public property route's own slug", () => {
    expect(
      listingPublicPath(SA, { address: "3 Westminster Rd", city: "Stamford" })
    ).toBe("/idx/sub-1/property/3-westminster-rd-stamford");
  });
});
