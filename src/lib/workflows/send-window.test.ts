import { describe, it, expect } from "vitest";
import { isSendGatedNodeType, secondsUntilSendWindow } from "./send-window";

describe("isSendGatedNodeType", () => {
  it("gates contact-facing send nodes", () => {
    expect(isSendGatedNodeType("send_sms")).toBe(true);
    expect(isSendGatedNodeType("send_email")).toBe(true);
    expect(isSendGatedNodeType("whatsapp_template")).toBe(true);
    expect(isSendGatedNodeType("google_review_request")).toBe(true);
  });

  it("does not gate internal-only node types", () => {
    expect(isSendGatedNodeType("webhook")).toBe(false);
    expect(isSendGatedNodeType("notify")).toBe(false);
    expect(isSendGatedNodeType("add_tag")).toBe(false);
    expect(isSendGatedNodeType("wait")).toBe(false);
    expect(isSendGatedNodeType("if_else")).toBe(false);
  });
});

describe("secondsUntilSendWindow", () => {
  it("allows sending with no configured window", () => {
    expect(secondsUntilSendWindow(null)).toBe(0);
    expect(secondsUntilSendWindow(undefined)).toBe(0);
  });

  it("allows sending inside the window", () => {
    // 14:30:00 UTC, window 9am-6pm UTC.
    const now = new Date("2026-07-14T14:30:00Z");
    expect(
      secondsUntilSendWindow({ startHour: 9, endHour: 18, timezone: "UTC" }, now),
    ).toBe(0);
  });

  it("allows sending exactly at the window open boundary", () => {
    const now = new Date("2026-07-14T09:00:00Z");
    expect(
      secondsUntilSendWindow({ startHour: 9, endHour: 18, timezone: "UTC" }, now),
    ).toBe(0);
  });

  it("blocks exactly at the window close boundary (end is exclusive)", () => {
    const now = new Date("2026-07-14T18:00:00Z");
    const deferred = secondsUntilSendWindow(
      { startHour: 9, endHour: 18, timezone: "UTC" },
      now,
    );
    expect(deferred).toBeGreaterThan(0);
    // Should defer to 9am tomorrow: 15 hours.
    expect(deferred).toBe(15 * 3600);
  });

  it("defers a late-night send to the next morning's window open", () => {
    // 23:15:00 UTC, window 9am-6pm UTC → defer to 9am tomorrow.
    const now = new Date("2026-07-14T23:15:00Z");
    const deferred = secondsUntilSendWindow(
      { startHour: 9, endHour: 18, timezone: "UTC" },
      now,
    );
    // From 23:15 to 09:00 next day = 9h45m = 35100s.
    expect(deferred).toBe(9 * 3600 + 45 * 60);
  });

  it("defers an early-morning send (before window open) to later today", () => {
    // 03:00:00 UTC, window 9am-6pm UTC → defer 6 hours to 9am today.
    const now = new Date("2026-07-14T03:00:00Z");
    const deferred = secondsUntilSendWindow(
      { startHour: 9, endHour: 18, timezone: "UTC" },
      now,
    );
    expect(deferred).toBe(6 * 3600);
  });

  it("evaluates the window in the contact's configured timezone, not UTC", () => {
    // 06:00:00 UTC = 22:00:00 in America/Los_Angeles the previous day
    // (UTC-8 in July is actually UTC-7 PDT, so 06:00 UTC = 23:00 PDT prev day).
    // Window 9am-6pm Pacific — this should be gated (11pm local).
    const now = new Date("2026-07-14T06:00:00Z");
    const deferred = secondsUntilSendWindow(
      { startHour: 9, endHour: 18, timezone: "America/Los_Angeles" },
      now,
    );
    expect(deferred).toBeGreaterThan(0);
  });

  it("fails open on a malformed window (start >= end)", () => {
    const now = new Date("2026-07-14T23:00:00Z");
    expect(
      secondsUntilSendWindow({ startHour: 18, endHour: 9, timezone: "UTC" }, now),
    ).toBe(0);
  });

  it("fails open on an invalid timezone string", () => {
    const now = new Date("2026-07-14T23:00:00Z");
    expect(
      secondsUntilSendWindow(
        { startHour: 9, endHour: 18, timezone: "Not/A_Real_Zone" },
        now,
      ),
    ).toBe(0);
  });

  it("fails open on out-of-range hour values", () => {
    const now = new Date("2026-07-14T23:00:00Z");
    expect(
      secondsUntilSendWindow({ startHour: -1, endHour: 18, timezone: "UTC" }, now),
    ).toBe(0);
    expect(
      secondsUntilSendWindow({ startHour: 9, endHour: 25, timezone: "UTC" }, now),
    ).toBe(0);
  });
});
