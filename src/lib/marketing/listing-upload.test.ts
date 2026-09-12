import { describe, expect, it } from "vitest";

import { parseListingUpload } from "./listing-upload";

describe("parseListingUpload", () => {
  it("creates a verified campaign record from pasted SmartMLS detail text", async () => {
    const listing = await parseListingUpload({
      buffer: Buffer.from(`
27 Terrace Place , Unit# 1 , Stamford, CT 06902
$5,500 Per Month
Active   3 Beds   2/1 Baths   2,165 SqFt
Condominium Rental
Listing ID : 24205988
Overview
Rare downtown rental with a bright open floor plan.
Year Built / Source : 2018 / Public Records
`),
      filename: "smartmls-listing.txt",
      subAccountId: "workspace-1",
      sourceId: "manual-import",
      photos: [],
    });

    expect(typeof listing).toBe("object");
    if (typeof listing === "string") throw new Error(listing);
    expect(listing).toMatchObject({
      id: "24205988",
      address: "27 Terrace Place , Unit# 1",
      city: "Stamford",
      state: "CT",
      zip: "06902",
      price: 5500,
      beds: 3,
      baths: 2,
      sqft: 2165,
      yearBuilt: 2018,
      propertyType: "Condominium Rental",
    });
  });
});
