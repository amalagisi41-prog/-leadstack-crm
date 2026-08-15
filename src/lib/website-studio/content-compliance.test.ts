import { describe, expect, it } from "vitest";
import {
  screenContentFields,
  describeBlockedFields,
} from "./content-compliance";

describe("website copy fair housing screening", () => {
  it("passes clean copy through untouched", () => {
    const result = screenContentFields({
      tagline: "Helping buyers find the right home in Fairfield County.",
      bio: "Fifteen years serving Connecticut buyers and sellers.",
    });
    expect(result.blocked).toEqual([]);
    expect(result.safeFields).toEqual({
      tagline: "Helping buyers find the right home in Fairfield County.",
      bio: "Fifteen years serving Connecticut buyers and sellers.",
    });
  });

  it("blocks familial-status steering in a tagline", () => {
    const result = screenContentFields({
      tagline: "Perfect for a family looking to settle down.",
    });
    expect(result.safeFields.tagline).toBeUndefined();
    expect(result.blocked).toEqual([
      { field: "tagline", phrases: ["perfect for a family"] },
    ]);
  });

  it("keeps clean fields from the same update when one field is blocked", () => {
    const result = screenContentFields({
      tagline: "Adults only community living.",
      ctaHeadline: "Ready to make your move?",
    });
    expect(result.safeFields).toEqual({
      ctaHeadline: "Ready to make your move?",
    });
    expect(result.blocked.map((b) => b.field)).toEqual(["tagline"]);
  });

  it("screens each entry of the specialties array", () => {
    const result = screenContentFields({
      specialties: ["Luxury homes", "Adults only", "Waterfront"],
    });
    expect(result.safeFields.specialties).toBeUndefined();
    expect(result.blocked[0].field).toBe("specialties");
    expect(result.blocked[0].phrases).toContain("adults only");
  });

  it("is case-insensitive", () => {
    const result = screenContentFields({ bio: "NO CHILDREN allowed here." });
    expect(result.blocked).toHaveLength(1);
    expect(result.blocked[0].phrases).toContain("no children");
  });

  it("screens SEO meta fields, which also publish", () => {
    const result = screenContentFields({
      metaDescription: "A quiet mature neighborhood for the right buyer.",
    });
    expect(result.blocked.map((b) => b.field)).toEqual(["metaDescription"]);
  });

  it("does not screen contact details or media URLs", () => {
    // These are not prose; screening them would only cause false positives.
    const result = screenContentFields({
      phone: "203-555-0100",
      heroImageUrl: "https://example.com/adults-only-club.jpg",
      instagram: "https://instagram.com/womenonly",
    });
    expect(result.blocked).toEqual([]);
    expect(Object.keys(result.safeFields)).toHaveLength(3);
  });

  it("passes through unknown keys so the caller's own allowlist still governs", () => {
    const result = screenContentFields({ someOtherKey: "value" });
    expect(result.safeFields.someOtherKey).toBe("value");
    expect(result.blocked).toEqual([]);
  });

  it("reports every offending field when several fail at once", () => {
    const result = screenContentFields({
      tagline: "No kids please.",
      bio: "Christian community focused.",
    });
    expect(result.blocked.map((b) => b.field).sort()).toEqual([
      "bio",
      "tagline",
    ]);
    expect(result.safeFields).toEqual({});
  });
});

describe("blocked-field explanation", () => {
  it("is empty when nothing was blocked", () => {
    expect(describeBlockedFields([])).toBe("");
  });

  it("names the field and the phrase that tripped it", () => {
    const message = describeBlockedFields([
      { field: "tagline", phrases: ["no children"] },
    ]);
    expect(message).toContain("tagline");
    expect(message).toContain('"no children"');
    expect(message).toContain("Fair Housing");
  });
});
