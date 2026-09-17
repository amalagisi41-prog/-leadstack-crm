import { describe, expect, it } from "vitest";
import {
  buildRprHomeUrl,
  formatAddressForRpr,
  isValidRprOrgId,
} from "./link";

describe("isValidRprOrgId", () => {
  it("accepts SmartMLS's real board code", () => {
    expect(isValidRprOrgId("ctconnm-n")).toBe(true);
  });

  it("accepts a single character", () => {
    expect(isValidRprOrgId("a")).toBe(true);
  });

  it("rejects empty string", () => {
    expect(isValidRprOrgId("")).toBe(false);
  });

  it("rejects uppercase", () => {
    expect(isValidRprOrgId("CTCONNM-N")).toBe(false);
  });

  it("rejects leading or trailing hyphen", () => {
    expect(isValidRprOrgId("-ctconnm")).toBe(false);
    expect(isValidRprOrgId("ctconnm-")).toBe(false);
  });

  it("rejects spaces and other punctuation", () => {
    expect(isValidRprOrgId("ct connm")).toBe(false);
    expect(isValidRprOrgId("ctconnm_n")).toBe(false);
    expect(isValidRprOrgId("ctconnm/n")).toBe(false);
  });
});

describe("buildRprHomeUrl", () => {
  it("matches the verified live SmartMLS→RPR SSO URL shape", () => {
    expect(buildRprHomeUrl("ctconnm-n")).toBe(
      "https://www.narrpr.com/home?cbcode=ctconnm-n"
    );
  });

  it("percent-encodes an unusual org id", () => {
    expect(buildRprHomeUrl("a b")).toBe(
      "https://www.narrpr.com/home?cbcode=a%20b"
    );
  });
});

describe("formatAddressForRpr", () => {
  it("formats a full address the way RPR's search box expects", () => {
    expect(
      formatAddressForRpr({
        address: "303 Weed Ave",
        city: "Stamford",
        state: "CT",
        zip: "06902",
      })
    ).toBe("303 Weed Ave, Stamford, CT 06902");
  });

  it("omits a missing zip without leaving a trailing space", () => {
    expect(
      formatAddressForRpr({
        address: "303 Weed Ave",
        city: "Stamford",
        state: "CT",
        zip: null,
      })
    ).toBe("303 Weed Ave, Stamford, CT");
  });

  it("drops empty city/state segments cleanly", () => {
    expect(
      formatAddressForRpr({
        address: "303 Weed Ave",
        city: "",
        state: "",
        zip: "",
      })
    ).toBe("303 Weed Ave");
  });
});
