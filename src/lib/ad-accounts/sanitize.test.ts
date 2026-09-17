import { describe, expect, it } from "vitest";
import { sanitizeAdAccountPayload } from "./sanitize";

describe("sanitizeAdAccountPayload", () => {
  it("passes through valid fields", () => {
    expect(
      sanitizeAdAccountPayload({
        platform: "meta",
        label: "  Acme Realty — Meta Ads  ",
        monthlySpendCents: 125000,
        currency: "usd",
        notes: "  managed by Jordan  ",
      }),
    ).toEqual({
      platform: "meta",
      label: "Acme Realty — Meta Ads",
      monthlySpendCents: 125000,
      currency: "USD",
      notes: "managed by Jordan",
    });
  });

  it("rejects an unknown platform value", () => {
    expect(sanitizeAdAccountPayload({ platform: "tiktok" })).toEqual({});
  });

  it("floors a negative spend to zero and rounds fractional cents", () => {
    expect(sanitizeAdAccountPayload({ monthlySpendCents: -5 })).toEqual({
      monthlySpendCents: 0,
    });
    expect(sanitizeAdAccountPayload({ monthlySpendCents: 10.6 })).toEqual({
      monthlySpendCents: 11,
    });
  });

  it("ignores non-finite spend values", () => {
    expect(sanitizeAdAccountPayload({ monthlySpendCents: Infinity })).toEqual(
      {},
    );
    expect(sanitizeAdAccountPayload({ monthlySpendCents: NaN })).toEqual({});
  });

  it("returns an empty object for an empty payload", () => {
    expect(sanitizeAdAccountPayload({})).toEqual({});
  });
});
