import { describe, it, expect } from "vitest";
import { compileWeeklyDigest } from "./compile";

describe("compileWeeklyDigest — snapshot fixtures", () => {
  it("a busy week with all four signals", () => {
    expect(
      compileWeeklyDigest({
        repliesSent: 47,
        bookingsCreated: 3,
        leadsRevived: 2,
        dealsWon: 1,
        dealsWonValue: 480_000,
      }),
    ).toMatchSnapshot();
  });

  it("a quiet week — isEmpty and the all-clear copy", () => {
    const digest = compileWeeklyDigest({
      repliesSent: 0,
      bookingsCreated: 0,
      leadsRevived: 0,
      dealsWon: 0,
      dealsWonValue: 0,
    });
    expect(digest).toMatchSnapshot();
    expect(digest.isEmpty).toBe(true);
  });

  it("singular vs plural grammar for exactly-one counts", () => {
    const digest = compileWeeklyDigest({
      repliesSent: 1,
      bookingsCreated: 1,
      leadsRevived: 1,
      dealsWon: 0,
      dealsWonValue: 0,
    });
    expect(digest.headline).toBe("1 reply, 1 booking, 1 lead revived");
  });
});

describe("compileWeeklyDigest — SMS text", () => {
  it("never exceeds 320 characters", () => {
    const digest = compileWeeklyDigest({
      repliesSent: 999_999,
      bookingsCreated: 999_999,
      leadsRevived: 999_999,
      dealsWon: 999_999,
      dealsWonValue: 999_999_999,
    });
    expect(digest.smsText.length).toBeLessThanOrEqual(320);
  });
});
