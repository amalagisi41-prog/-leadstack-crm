import { describe, expect, it } from "vitest";
import { matchPages } from "./pages";

describe("Cmd+K page search", () => {
  it("finds Review Requests for 'review' and related words", () => {
    for (const q of ["review", "Reviews", "google review", "reputation"]) {
      expect(matchPages(q).map((p) => p.path)).toContain("/review-requests");
    }
    expect(matchPages("")).toEqual([]);
  });
});
