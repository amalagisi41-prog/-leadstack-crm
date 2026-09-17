import { describe, expect, it } from "vitest";
import {
  buildRprHomeUrl,
  formatAddressForRpr,
  isValidRprOrgId,
  parseRprOrgId,
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

describe("parseRprOrgId", () => {
  it("accepts a bare org code", () => {
    expect(parseRprOrgId("ctconnm-n")).toBe("ctconnm-n");
  });

  it("extracts the code from the exact URL a real agent pasted", () => {
    // This string was rejected as "that doesn't look like an RPR org code",
    // which is what prompted this function: finding the value means being
    // signed into RPR and looking at its URL, so a URL is what lands on the
    // clipboard.
    expect(
      parseRprOrgId(
        "narrpr.com/home?cbcode=ctconnm-n&listingid=24158847&pmode=1&LocationType=4",
      ),
    ).toBe("ctconnm-n");
  });

  it("handles the URL with a scheme and host prefix", () => {
    expect(parseRprOrgId("https://www.narrpr.com/home?cbcode=ctconnm-n")).toBe(
      "ctconnm-n",
    );
  });

  it("falls back to orgid on a property-details URL", () => {
    expect(
      parseRprOrgId(
        "https://www.narrpr.com/properties/details/info/78418177?orgid=ctconnm",
      ),
    ).toBe("ctconnm");
  });

  it("prefers cbcode over orgid when a URL carries both", () => {
    // They hold different values on RPR's own URLs, and cbcode is the one
    // the MLS-SSO entry link is actually built from.
    expect(
      parseRprOrgId("narrpr.com/home?orgid=ctconnm&cbcode=ctconnm-n"),
    ).toBe("ctconnm-n");
  });

  it("lowercases a mis-cased paste rather than rejecting it", () => {
    expect(parseRprOrgId("CTCONNM-N")).toBe("ctconnm-n");
    expect(parseRprOrgId("narrpr.com/home?cbcode=CTCONNM-N")).toBe("ctconnm-n");
  });

  it("trims surrounding whitespace", () => {
    expect(parseRprOrgId("  ctconnm-n  ")).toBe("ctconnm-n");
  });

  it("returns null for a URL with no board code in it", () => {
    expect(parseRprOrgId("https://www.narrpr.com/home?pmode=1")).toBeNull();
  });

  it("returns null for genuine garbage rather than storing it", () => {
    expect(parseRprOrgId("")).toBeNull();
    expect(parseRprOrgId("   ")).toBeNull();
    expect(parseRprOrgId("not a code!")).toBeNull();
    expect(parseRprOrgId("narrpr.com/home?cbcode=not%20a%20code")).toBeNull();
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
        address: "123 Main St",
        city: "Stamford",
        state: "CT",
        zip: "06902",
      })
    ).toBe("123 Main St, Stamford, CT 06902");
  });

  it("omits a missing zip without leaving a trailing space", () => {
    expect(
      formatAddressForRpr({
        address: "123 Main St",
        city: "Stamford",
        state: "CT",
        zip: null,
      })
    ).toBe("123 Main St, Stamford, CT");
  });

  it("drops empty city/state segments cleanly", () => {
    expect(
      formatAddressForRpr({
        address: "123 Main St",
        city: "",
        state: "",
        zip: "",
      })
    ).toBe("123 Main St");
  });
});
