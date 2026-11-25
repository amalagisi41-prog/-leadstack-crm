import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { listComparisons } from "./index";
import { SOLO_MONTHLY_TERMS, SOLO_PRICE } from "@/lib/public-site/offer";

const ROOT = join(__dirname, "../../..");

describe("comparison pages quote the configured Solo price", () => {
  const all = JSON.stringify(listComparisons());

  it("never contain $199 or an unfilled placeholder", () => {
    expect(all).not.toContain("$199");
    expect(all).not.toMatch(/\{\{\w+\}\}/);
  });

  it("every Solo mention uses the configured price", () => {
    const near = /Solo[^$."]{0,40}\$(\d+)|\$(\d+)(?:\/mo(?:nth)?)?[^.$"]{0,25}\bSolo\b/g;
    const amounts = [...all.matchAll(near)].map((m) => m[1] ?? m[2]);
    expect(amounts.length).toBeGreaterThan(5);
    for (const a of amounts) expect(a).toBe(String(SOLO_PRICE));
  });

  it("follow-up-boss and kvcore state the /pricing offer terms verbatim", () => {
    for (const slug of ["follow-up-boss", "kvcore"]) {
      const c = JSON.stringify(listComparisons().find((x) => x.slug === slug));
      expect(c).toContain(`$${SOLO_PRICE}/mo`);
      expect(c).toContain(SOLO_MONTHLY_TERMS);
    }
  });

  it("no comparison source hard-codes a dollar Solo price", () => {
    const dir = join(ROOT, "src/data/comparisons");
    for (const f of readdirSync(dir).filter((n) => /\.(json|ts)$/.test(n) && !n.includes(".test."))) {
      const src = readFileSync(join(dir, f), "utf8");
      expect(src, f).not.toMatch(/Solo[^$\n,]{0,40}\$\d/);
      expect(src, f).not.toContain("$199");
    }
  });
});
