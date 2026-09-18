import { describe, expect, it } from "vitest";
import {
  buildRprHomeUrl,
  buildRprPropertyUrl,
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

describe("buildRprPropertyUrl", () => {
  const property = {
    rprOrgId: "ctconnm-n",
    address: "123 Main St",
    city: "Stamford",
    state: "CT",
    zip: "06902",
  };

  it("uses the MLS listing number when the property has one", () => {
    const url = new URL(
      buildRprPropertyUrl({ ...property, mlsId: "24158847" })!,
    );
    expect(url.origin + url.pathname).toBe("https://narrpr.com/deep-link");
    expect(url.searchParams.get("cbcode")).toBe("ctconnm-n");
    expect(url.searchParams.get("listingid")).toBe("24158847");
  });

  it("does not also send an address query when it has the listing number", () => {
    // RPR's own builder populates one lookup key, not two. Sending both is a
    // shape their form never produces, so we don't invent it.
    const url = new URL(
      buildRprPropertyUrl({ ...property, mlsId: "24158847" })!,
    );
    expect(url.searchParams.get("query")).toBeNull();
    expect(url.searchParams.get("searchtype")).toBeNull();
  });

  it("falls back to a full-address property search with no MLS number", () => {
    const url = new URL(buildRprPropertyUrl({ ...property, mlsId: null })!);
    expect(url.searchParams.get("query")).toBe("123 Main St, Stamford, CT 06902");
    expect(url.searchParams.get("searchtype")).toBe("Properties");
    expect(url.searchParams.get("listingid")).toBeNull();
  });

  it("treats a blank MLS number as absent rather than searching for nothing", () => {
    const url = new URL(buildRprPropertyUrl({ ...property, mlsId: "   " })!);
    expect(url.searchParams.get("listingid")).toBeNull();
    expect(url.searchParams.get("query")).toBe("123 Main St, Stamford, CT 06902");
  });

  it("returns null rather than a link that would land on the wrong town", () => {
    // RPR requires city + state on the address query. A bare street line
    // resolves somewhere plausible and wrong, which is worse than no link —
    // the caller falls back to the RPR home page instead.
    expect(
      buildRprPropertyUrl({ ...property, city: "", mlsId: null }),
    ).toBeNull();
    expect(
      buildRprPropertyUrl({ ...property, state: "", mlsId: null }),
    ).toBeNull();
    expect(
      buildRprPropertyUrl({ ...property, address: "  ", mlsId: null }),
    ).toBeNull();
  });

  it("still builds an address link when only the zip is missing", () => {
    const url = new URL(
      buildRprPropertyUrl({ ...property, zip: null, mlsId: null })!,
    );
    expect(url.searchParams.get("query")).toBe("123 Main St, Stamford, CT");
  });

  it("encodes the address rather than emitting raw spaces and commas", () => {
    const raw = buildRprPropertyUrl({ ...property, mlsId: null })!;
    expect(raw).not.toMatch(/ /);
    expect(raw).toContain("query=123+Main+St%2C+Stamford%2C+CT+06902");
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
