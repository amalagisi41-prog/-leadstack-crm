import { describe, expect, it } from "vitest";
import { buildContentBrief, channelCopyFor } from "./content-brief";
import type { IdxListingDoc } from "@/types/idx";

const listing = {
  id: "idx-1", subAccountId: "sa-1", mlsId: "MLS-1", status: "active", price: 725000,
  address: "10 Main Street", city: "Stamford", state: "CT", zip: "06901", beds: 3, baths: 2,
  sqft: 1800, yearBuilt: 1990, propertyType: "Single Family", photos: ["https://example.com/home.jpg"], remarks: "",
  listingAgentName: null, listingOfficeName: null, disclaimer: "MLS data provided as-is.", lat: 41, lng: -73, raw: { daysOnMarket: 45 }, syncedAt: {} as never,
} satisfies IdxListingDoc;

describe("content brief channel copy", () => {
  it("builds differentiated, facts-only copy for every channel", () => {
    const brief = buildContentBrief(listing, new Date("2026-09-08T00:00:00Z"));
    const bodies = brief.channels.map((channel) => channel.body);
    expect(new Set(bodies).size).toBe(8);
    expect(brief.channels.find((c) => c.channel === "sms")?.body).toContain("Reply STOP to opt out.");
    expect(brief.channels.find((c) => c.channel === "email")?.body).toContain("Subject:");
    expect(brief.channels.find((c) => c.channel === "googleBusiness")?.body).toContain("Stamford real estate listing");
    expect(brief.channels.every((channel) => channel.findings.length === 0)).toBe(true);
  });

  it("never adds unsupported amenities to channel copy", () => {
    const copy = channelCopyFor("facebook", listing, "1,800 square feet of living space");
    expect(copy).toContain("1,800 square feet of living space");
    expect(copy).not.toMatch(/pool|waterfront|renovated|school district/i);
  });
});
