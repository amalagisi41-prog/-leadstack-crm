import { describe, expect, it } from "vitest";
import { normalizeAddressKey, stableListingId, stableSourceId } from "./listing-dedupe";

describe("normalizeAddressKey", () => {
  it("treats common street-suffix and directional abbreviations as equivalent", () => {
    expect(normalizeAddressKey("303 Weed Avenue", "Stamford", "CT")).toBe(
      normalizeAddressKey("303 Weed Ave", "Stamford", "CT"),
    );
    expect(normalizeAddressKey("29 Division Street West", "Greenwich", "CT")).toBe(
      normalizeAddressKey("29 Division St W", "Greenwich", "CT"),
    );
  });

  it("ignores case, punctuation, and extra whitespace", () => {
    expect(normalizeAddressKey("303 Weed Avenue,", "Stamford", "CT")).toBe(
      normalizeAddressKey("  303   WEED   AVENUE", "stamford", "ct"),
    );
  });

  it("distinguishes genuinely different addresses", () => {
    expect(normalizeAddressKey("303 Weed Avenue", "Stamford", "CT")).not.toBe(
      normalizeAddressKey("151 Sun Dance Road", "Stamford", "CT"),
    );
  });

  it("distinguishes different units at the same street number", () => {
    // A unit number is part of the address text, not stripped — two
    // different condos at one street number are two different properties.
    expect(normalizeAddressKey("29 Division Street #3", "Greenwich", "CT")).not.toBe(
      normalizeAddressKey("29 Division Street #4", "Greenwich", "CT"),
    );
  });
});

describe("stableListingId", () => {
  it("is deterministic for the same key", () => {
    const key = normalizeAddressKey("303 Weed Avenue", "Stamford", "CT");
    expect(stableListingId(key)).toBe(stableListingId(key));
  });

  it("differs for different keys", () => {
    expect(
      stableListingId(normalizeAddressKey("303 Weed Avenue", "Stamford", "CT")),
    ).not.toBe(
      stableListingId(normalizeAddressKey("151 Sun Dance Road", "Stamford", "CT")),
    );
  });

  it("is prefixed so it's recognizable as address-derived rather than an MLS id", () => {
    expect(stableListingId("x|y|z")).toMatch(/^prop-[0-9a-f]{16}$/);
  });
});

describe("stableSourceId", () => {
  it("is deterministic for the same URL", () => {
    const url = "https://caseyspropertygroup.com/listings/";
    expect(stableSourceId(url)).toBe(stableSourceId(url));
  });

  it("treats a trailing slash and case as equivalent, so connecting the same page twice updates one source", () => {
    expect(stableSourceId("https://caseyspropertygroup.com/listings/")).toBe(
      stableSourceId("https://CaseysPropertyGroup.com/listings"),
    );
  });

  it("differs for genuinely different pages", () => {
    expect(stableSourceId("https://one.example/listings")).not.toBe(
      stableSourceId("https://two.example/listings"),
    );
  });

  it("is prefixed distinctly from a listing id so the two can never collide", () => {
    expect(stableSourceId("https://example.com")).toMatch(/^src-[0-9a-f]{16}$/);
  });
});
