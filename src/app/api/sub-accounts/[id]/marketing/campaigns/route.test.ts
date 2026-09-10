import { describe, expect, it } from "vitest";
import { buildManualListing, isIdxCampaignEnabled, listingMatchesIdentifier } from "@/lib/marketing/campaign-route-helpers";

describe("campaign POST route helpers", () => {
  it("supports manual-entry fallback without a synced MLS record", () => {
    const listing = buildManualListing({ address: "10 Main Street", city: "Stamford", state: "CT", price: 500000, beds: 2, baths: 1 }, "sa-1", "manual-1");
    expect(typeof listing).not.toBe("string");
    if (typeof listing !== "string") expect(listing).toMatchObject({ id: "manual-1", mlsId: "manual", address: "10 Main Street", city: "Stamford" });
  });

  it("blocks campaign creation when IDX is not enabled", () => {
    expect(isIdxCampaignEnabled({ idxEnabledByAgency: false, idxConfig: { enabled: true } as never })).toBe(false);
    expect(isIdxCampaignEnabled({ idxEnabledByAgency: true, idxConfig: { enabled: true } as never })).toBe(true);
  });

  it("matches a listing number from the cached id or raw IDX identifier", () => {
    const listing = buildManualListing({ address: "10 Main Street", city: "Stamford", state: "CT" }, "sa-1", "24194554");
    if (typeof listing === "string") throw new Error(listing);
    expect(listingMatchesIdentifier(listing, "24194554")).toBe(true);
    expect(listingMatchesIdentifier({ ...listing, id: "vendor-id", raw: { mlsNumber: 24194554 } }, "24194554")).toBe(true);
    expect(listingMatchesIdentifier(listing, "99999999")).toBe(false);
  });
});
