import { describe, expect, it } from "vitest";
import { findRprBoard, VERIFIED_RPR_BOARDS } from "./boards";
import { isValidRprOrgId } from "./link";

/**
 * The value of this list is that every code in it is real. A guessed code
 * doesn't fail loudly — it sends the agent to an SSO entry that doesn't
 * work, which reads as our bug. These tests hold the list's shape; the
 * "verified against a live session" part is enforced by the comment in
 * boards.ts and by review.
 */

describe("VERIFIED_RPR_BOARDS", () => {
  it("only contains codes the link builder will actually accept", () => {
    for (const board of VERIFIED_RPR_BOARDS) {
      expect(
        isValidRprOrgId(board.orgId),
        `${board.label} has an org code the URL builder would reject`,
      ).toBe(true);
    }
  });

  it("gives every board a name and region an agent would recognise", () => {
    for (const board of VERIFIED_RPR_BOARDS) {
      expect(board.label.trim().length).toBeGreaterThan(0);
      expect(board.region.trim().length).toBeGreaterThan(0);
    }
  });

  it("has no duplicate org codes", () => {
    const codes = VERIFIED_RPR_BOARDS.map((b) => b.orgId);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("includes SmartMLS, the board this was verified against live", () => {
    expect(findRprBoard("ctconnm-n")?.region).toBe("Connecticut");
  });

  it("returns null for a board it doesn't know", () => {
    expect(findRprBoard("not-a-real-board")).toBeNull();
  });
});
