import { describe, it, expect } from "vitest";
import { localTimeInfo } from "./local-time";

describe("localTimeInfo", () => {
  it("reads hour + date in UTC", () => {
    const now = new Date("2026-07-14T09:15:30Z");
    const info = localTimeInfo("UTC", now);
    expect(info.hour).toBe(9);
    expect(info.dateKey).toBe("2026-07-14");
  });

  it("shifts the calendar date across a timezone boundary", () => {
    // 23:30 UTC is already the next day in a timezone far enough ahead.
    const now = new Date("2026-07-14T23:30:00Z");
    const info = localTimeInfo("Pacific/Auckland", now);
    expect(info.dateKey).toBe("2026-07-15");
  });

  it("computes day-start/day-end as a 24h window bracketing `now`", () => {
    const now = new Date("2026-07-14T09:15:30Z");
    const info = localTimeInfo("UTC", now);
    expect(info.dayStartMs).toBeLessThanOrEqual(now.getTime());
    expect(info.dayEndMs).toBeGreaterThan(now.getTime());
    expect(info.dayEndMs - info.dayStartMs).toBe(24 * 60 * 60 * 1000);
    expect(new Date(info.dayStartMs).toISOString()).toBe(
      "2026-07-14T00:00:00.000Z",
    );
  });

  it("computes correct local-midnight boundaries for a non-UTC timezone", () => {
    // Noon UTC on 2026-07-14 is 2026-07-14 05:00 in America/New_York (EDT,
    // UTC-4 in July). Local midnight there is 2026-07-14T04:00:00Z.
    const now = new Date("2026-07-14T12:00:00Z");
    const info = localTimeInfo("America/New_York", now);
    expect(info.hour).toBe(8); // 12:00 UTC - 4h = 08:00 EDT
    expect(new Date(info.dayStartMs).toISOString()).toBe(
      "2026-07-14T04:00:00.000Z",
    );
  });

  it("falls back to UTC for an invalid timezone string", () => {
    const now = new Date("2026-07-14T09:15:30Z");
    const info = localTimeInfo("Not/A_Real_Zone", now);
    expect(info.hour).toBe(9);
    expect(info.dateKey).toBe("2026-07-14");
  });

  it("falls back to UTC for an empty/missing timezone", () => {
    const now = new Date("2026-07-14T09:15:30Z");
    expect(localTimeInfo(null, now).dateKey).toBe("2026-07-14");
    expect(localTimeInfo("", now).dateKey).toBe("2026-07-14");
  });
});
