import { describe, it, expect } from "vitest";
import {
  todayPartsInTimezone,
  monthDayOf,
  matchesTodayMonthDay,
  daysBetween,
  yearInTimezone,
} from "./time-trigger-dates";

describe("todayPartsInTimezone", () => {
  it("reads calendar parts in the given timezone", () => {
    // 2026-07-14T23:30:00Z is 2026-07-14 in UTC but 2026-07-15 in a
    // timezone far enough ahead — proves timezone actually shifts the date.
    const now = new Date("2026-07-14T23:30:00Z");
    expect(todayPartsInTimezone("UTC", now)).toEqual({ year: 2026, month: 7, day: 14 });
    expect(todayPartsInTimezone("Pacific/Auckland", now)).toEqual({
      year: 2026,
      month: 7,
      day: 15,
    });
  });

  it("falls back to UTC for an empty/invalid timezone", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    expect(todayPartsInTimezone(null, now)).toEqual({ year: 2026, month: 1, day: 1 });
    expect(todayPartsInTimezone("", now)).toEqual({ year: 2026, month: 1, day: 1 });
  });
});

describe("monthDayOf", () => {
  it("extracts MM-DD from a YYYY-MM-DD string", () => {
    expect(monthDayOf("1990-06-15")).toBe("06-15");
  });

  it("returns null for missing or malformed input", () => {
    expect(monthDayOf(null)).toBeNull();
    expect(monthDayOf(undefined)).toBeNull();
    expect(monthDayOf("")).toBeNull();
    expect(monthDayOf("not-a-date")).toBeNull();
    expect(monthDayOf("06-15")).toBeNull();
  });
});

describe("matchesTodayMonthDay", () => {
  it("matches when month/day line up regardless of year", () => {
    const now = new Date("2026-06-15T12:00:00Z");
    expect(matchesTodayMonthDay("1990-06-15", "UTC", now)).toBe(true);
    expect(matchesTodayMonthDay("2020-06-15", "UTC", now)).toBe(true);
  });

  it("does not match a different month or day", () => {
    const now = new Date("2026-06-15T12:00:00Z");
    expect(matchesTodayMonthDay("1990-06-16", "UTC", now)).toBe(false);
    expect(matchesTodayMonthDay("1990-07-15", "UTC", now)).toBe(false);
  });

  it("returns false for an unset field", () => {
    const now = new Date("2026-06-15T12:00:00Z");
    expect(matchesTodayMonthDay(null, "UTC", now)).toBe(false);
  });
});

describe("daysBetween", () => {
  it("floors partial days", () => {
    const from = Date.parse("2026-01-01T00:00:00Z");
    const to = Date.parse("2026-01-04T12:00:00Z");
    expect(daysBetween(from, to)).toBe(3);
  });

  it("returns 0 for the same instant", () => {
    const ms = Date.parse("2026-01-01T00:00:00Z");
    expect(daysBetween(ms, ms)).toBe(0);
  });
});

describe("yearInTimezone", () => {
  it("reads the calendar year in the given timezone", () => {
    const ms = Date.parse("2026-12-31T23:30:00Z");
    expect(yearInTimezone(ms, "UTC")).toBe(2026);
    expect(yearInTimezone(ms, "Pacific/Auckland")).toBe(2027);
  });
});
