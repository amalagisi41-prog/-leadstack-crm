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

  it("gives two rows with no listing number the same id when the address matches", async () => {
    // Regression: a row with no parseable MLS/listing number used to fall
    // back to the per-request sourceId, so retrying a failed upload (or
    // re-pasting the same property) minted a brand-new duplicate record
    // every time instead of updating the one already there.
    const first = await parseListingUpload({
      buffer: Buffer.from("303 Weed Avenue, Stamford, CT 06902\n"),
      filename: "attempt-1.txt",
      subAccountId: "workspace-1",
      sourceId: "manual-import-1",
      photos: [],
    });
    const second = await parseListingUpload({
      buffer: Buffer.from("303 Weed Ave, Stamford, CT 06902\n$799,000\n4 Beds 2 Baths\n"),
      filename: "attempt-2.txt",
      subAccountId: "workspace-1",
      sourceId: "manual-import-2",
      photos: [],
    });
    if (typeof first === "string") throw new Error(first);
    if (typeof second === "string") throw new Error(second);
    expect(first.id).toBe(second.id);
  });

  it("gives two different addresses different ids when neither has a listing number", async () => {
    const a = await parseListingUpload({
      buffer: Buffer.from("29 Division Street West #3, Greenwich, CT 06830\n"),
      filename: "a.txt",
      subAccountId: "workspace-1",
      sourceId: "manual-import-a",
      photos: [],
    });
    const b = await parseListingUpload({
      buffer: Buffer.from("151 Sun Dance Road, Stamford, CT 06903\n"),
      filename: "b.txt",
      subAccountId: "workspace-1",
      sourceId: "manual-import-b",
      photos: [],
    });
    if (typeof a === "string") throw new Error(a);
    if (typeof b === "string") throw new Error(b);
    expect(a.id).not.toBe(b.id);
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
