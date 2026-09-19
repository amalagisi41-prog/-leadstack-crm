import { describe, expect, it } from "vitest";
import {
  inquiryTimeMs,
  summariseListingInquiries,
} from "./inquiry-stats";

describe("inquiryTimeMs", () => {
  it("reads a Date", () => {
    const d = new Date("2026-09-19T10:00:00Z");
    expect(inquiryTimeMs(d)).toBe(d.getTime());
  });

  it("reads epoch millis", () => {
    expect(inquiryTimeMs(1758276000000)).toBe(1758276000000);
  });

  it("reads a Firestore-style Timestamp", () => {
    const d = new Date("2026-09-19T10:00:00Z");
    expect(inquiryTimeMs({ toDate: () => d })).toBe(d.getTime());
  });

  it("returns null for an unmaterialised server timestamp", () => {
    // A sentinel read back before the server resolves it. Reporting this as
    // "now" would claim activity at a time nobody observed.
    expect(inquiryTimeMs(null)).toBe(null);
    expect(inquiryTimeMs(undefined)).toBe(null);
    expect(inquiryTimeMs({})).toBe(null);
  });

  it("returns null rather than NaN for an invalid Date", () => {
    expect(inquiryTimeMs(new Date("nonsense"))).toBe(null);
  });

  it("returns null when toDate throws", () => {
    expect(
      inquiryTimeMs({
        toDate: () => {
          throw new Error("no");
        },
      })
    ).toBe(null);
  });
});

describe("summariseListingInquiries", () => {
  it("returns nothing for no rows", () => {
    expect(summariseListingInquiries([])).toEqual({});
  });

  it("counts each inquiry separately, including repeats on one listing", () => {
    // Three inquiries on one property is three pieces of interest, even if
    // the same person made them.
    const stats = summariseListingInquiries([
      { listingId: "a", createdAt: 1000 },
      { listingId: "a", createdAt: 2000 },
      { listingId: "a", createdAt: 3000 },
    ]);
    expect(stats.a.count).toBe(3);
  });

  it("keeps the most recent timestamp regardless of row order", () => {
    const stats = summariseListingInquiries([
      { listingId: "a", createdAt: 3000 },
      { listingId: "a", createdAt: 1000 },
      { listingId: "a", createdAt: 2000 },
    ]);
    expect(stats.a.lastAt).toBe(3000);
  });

  it("separates listings", () => {
    const stats = summariseListingInquiries([
      { listingId: "a", createdAt: 1000 },
      { listingId: "b", createdAt: 5000 },
      { listingId: "a", createdAt: 2000 },
    ]);
    expect(stats.a).toEqual({ count: 2, lastAt: 2000 });
    expect(stats.b).toEqual({ count: 1, lastAt: 5000 });
  });

  it("omits listings with no inquiries rather than reporting zero", () => {
    // An absent key cannot be mistaken for a measured zero if the query
    // failed; a present `{count: 0}` could.
    const stats = summariseListingInquiries([{ listingId: "a" }]);
    expect(stats.b).toBeUndefined();
    expect(Object.keys(stats)).toEqual(["a"]);
  });

  it("counts a row whose date is unusable but does not let it set lastAt", () => {
    const stats = summariseListingInquiries([
      { listingId: "a", createdAt: 1000 },
      { listingId: "a", createdAt: null },
    ]);
    expect(stats.a).toEqual({ count: 2, lastAt: 1000 });
  });

  it("leaves lastAt null when no row has a usable date", () => {
    const stats = summariseListingInquiries([
      { listingId: "a" },
      { listingId: "a" },
    ]);
    expect(stats.a).toEqual({ count: 2, lastAt: null });
  });

  it("ignores rows with no listing id", () => {
    const stats = summariseListingInquiries([
      { listingId: "", createdAt: 1 },
      { listingId: "   ", createdAt: 1 },
      { createdAt: 1 },
      { listingId: 42, createdAt: 1 },
      { listingId: "a", createdAt: 1 },
    ]);
    expect(Object.keys(stats)).toEqual(["a"]);
  });

  it("trims a listing id so it matches the doc id it came from", () => {
    const stats = summariseListingInquiries([
      { listingId: " a ", createdAt: 1 },
      { listingId: "a", createdAt: 2 },
    ]);
    expect(stats.a).toEqual({ count: 2, lastAt: 2 });
  });
});
