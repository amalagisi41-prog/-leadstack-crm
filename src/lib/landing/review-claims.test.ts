import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PURCHASABLE_PLAN_KEYS, isPurchasablePlanKey } from "@/config/landing";

/**
 * Marketing and help copy for Review Requests must describe only what
 * shipped: Google link, delay (default 3 days), log, manual send, and the
 * Off / Log only / Live control — included, not a paid add-on.
 */
const ROOT = join(__dirname, "../../..");
const FILES = [
  "src/components/landing-custom/add-ons.tsx",
  "src/components/landing-custom/features.tsx",
  "src/content/help/review-requests.md",
  "src/lib/public-site/capability-status.ts",
  "src/config/landing.ts",
];
const FORBIDDEN = [
  /Review Manager/i,
  /Zillow/i,
  /unified dashboard/i,
  /alert on every new review/i,
  /response templates/i,
  /right after closing/i,
];

describe("Review Requests claims", () => {
  for (const file of FILES) {
    it(`${file} makes no unshipped review claims`, () => {
      const text = readFileSync(join(ROOT, file), "utf8");
      for (const re of FORBIDDEN) expect(text, String(re)).not.toMatch(re);
    });
  }

  it("the help article states the shipped behaviour", () => {
    const text = readFileSync(join(ROOT, "src/content/help/review-requests.md"), "utf8");
    for (const must of ["3 days", "Google only", "Off", "Log only", "Live", "Grow My Business → Review Requests"]) {
      expect(text).toContain(must);
    }
  });

  it("the Review Requests card is included, not priced", () => {
    const text = readFileSync(join(ROOT, "src/components/landing-custom/add-ons.tsx"), "utf8");
    const card = text.slice(text.indexOf("reviewRequests"), text.indexOf("Local SEO"));
    expect(card).toContain('price: "Included"');
    expect(card).not.toMatch(/\$\d/);
  });
});

describe("plan availability", () => {
  it("Team is on hold: not purchasable, so no switch is offered", () => {
    expect(isPurchasablePlanKey("starter")).toBe(true);
    expect(isPurchasablePlanKey("pro")).toBe(false);
    expect(PURCHASABLE_PLAN_KEYS).toEqual(["starter"]);
  });
});
