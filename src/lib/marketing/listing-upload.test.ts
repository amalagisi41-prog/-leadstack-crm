import { describe, expect, it } from "vitest";

import { parseListingUpload, parseListingUploads } from "./listing-upload";

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

  it("parses the SmartMLS location line when a unit number is not comma-separated from the city", async () => {
    const listing = await parseListingUpload({
      buffer: Buffer.from(`
27 Terrace Place, Unit# 1 Stamford, CT 06902
$5,500 Per Month
Active 3 Beds 2/1 Baths 2,165 SqFt
Listing ID : 24205988
`),
      filename: "smartmls-listing.txt",
      subAccountId: "workspace-1",
      sourceId: "manual-import",
      photos: [],
    });

    expect(typeof listing).toBe("object");
    if (typeof listing === "string") throw new Error(listing);
    expect(listing).toMatchObject({
      address: "27 Terrace Place, Unit# 1",
      city: "Stamford",
      state: "CT",
      zip: "06902",
    });
  });

  it("imports the first listing from a portal export collection", async () => {
    const listing = await parseListingUpload({
      buffer: Buffer.from(JSON.stringify({
        source: "authorized Zillow export",
        listings: [
          {
            listingId: "portal-123-main",
            streetAddress: "123 Main Street",
            city: "Stamford",
            state: "CT",
            zipcode: "06902",
            price: "$3,200",
            bedrooms: 2,
            bathrooms: 1,
            livingArea: 1100,
            description: "A bright rental near downtown.",
          },
        ],
      })),
      filename: "zillow-listings.json",
      subAccountId: "workspace-1",
      sourceId: "portal-import",
      photos: [],
    });

    expect(typeof listing).toBe("object");
    if (typeof listing === "string") throw new Error(listing);
    expect(listing).toMatchObject({
      id: "portal-123-main",
      address: "123 Main Street",
      city: "Stamford",
      state: "CT",
      zip: "06902",
      price: 3200,
      beds: 2,
      baths: 1,
      sqft: 1100,
    });
  });

  it("returns every valid row from a multi-listing export", async () => {
    const result = await parseListingUploads({
      buffer: Buffer.from([
        "listingId,address,city,state,zip,price",
        "one,1 Main Street,Stamford,CT,06902,1000",
        "two,2 Main Street,Stamford,CT,06902,2000",
      ].join("\n")),
      filename: "homes-listings.csv",
      subAccountId: "workspace-1",
      sourceId: "portal-import",
      photos: [],
    });

    expect(result.errors).toEqual([]);
    expect(result.listings).toHaveLength(2);
    expect(result.listings.map((listing) => listing.id)).toEqual([
      "one",
      "two",
    ]);
    expect(result.listings.map((listing) => listing.address)).toEqual([
      "1 Main Street",
      "2 Main Street",
    ]);
  });
});
