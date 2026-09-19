import { describe, expect, it } from "vitest";
import { shouldMarkOffMarket } from "./sync";

/**
 * The staleness rule decides whether a listing already in the workspace gets
 * flipped to off-market because the latest IDX sync did not return it.
 *
 * It is only ever allowed to touch listings that came FROM the feed. The
 * collection holds hand-added off-market property too, and "absent from the
 * feed" says nothing about a property that was never in it.
 */

const feedListing = { raw: {} };
const manualListing = { raw: { importedFrom: "guided manual entry" } };
const importedListing = { raw: { importedFrom: "csv upload" } };

describe("shouldMarkOffMarket", () => {
  it("flips a feed listing the sync no longer returns", () => {
    expect(shouldMarkOffMarket(feedListing, new Set(), "mls-1")).toBe(true);
  });

  it("leaves a feed listing the sync still returns", () => {
    expect(shouldMarkOffMarket(feedListing, new Set(["mls-1"]), "mls-1")).toBe(
      false
    );
  });

  it("never flips a hand-added property", () => {
    // The operator set this status themselves. A feed that does not mention
    // the property is not evidence about it.
    expect(shouldMarkOffMarket(manualListing, new Set(), "manual-1")).toBe(
      false
    );
  });

  it("never flips an imported property", () => {
    expect(shouldMarkOffMarket(importedListing, new Set(), "imported-1")).toBe(
      false
    );
  });

  it("leaves every hand-added property alone when a sync returns nothing", () => {
    // The case that made this urgent: a sync returning zero listings used to
    // rewrite the status of everything in the workspace at once.
    const empty = new Set<string>();
    expect(shouldMarkOffMarket(manualListing, empty, "a")).toBe(false);
    expect(shouldMarkOffMarket(importedListing, empty, "b")).toBe(false);
    // A feed listing still flips — that part was correct and stays.
    expect(shouldMarkOffMarket(feedListing, empty, "c")).toBe(true);
  });

  it("treats a missing listing as nothing to do", () => {
    expect(shouldMarkOffMarket(null, new Set(), "x")).toBe(false);
    expect(shouldMarkOffMarket(undefined, new Set(), "x")).toBe(false);
  });

  it("matches on the document id, not a field inside the document", () => {
    // The feed's ids are the document ids; a stray `id` field must not be
    // able to spare or condemn a row.
    expect(
      shouldMarkOffMarket({ ...feedListing, id: "other" }, new Set(["mls-1"]), "mls-1")
    ).toBe(false);
    expect(
      shouldMarkOffMarket({ ...feedListing, id: "mls-1" }, new Set(["other"]), "mls-1")
    ).toBe(true);
  });
});
