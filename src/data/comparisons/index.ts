import type { Comparison } from "@/types/comparisons";
import { gohighlevelComparison } from "./gohighlevel";
import followUpBossData from "./follow-up-boss.json";
import kvcoreData from "./kvcore.json";
import { SOLO_MONTHLY_TERMS, SOLO_PRICE } from "@/lib/public-site/offer";

/**
 * The JSON comparison pages may not hard-code AgentStack's price: they use
 * {{SOLO_PRICE}} / {{SOLO_MONTHLY_TERMS}} placeholders, filled here from the
 * same offer constants /pricing and checkout use, so the price can't drift
 * (these pages once drifted to a stale figure). An unknown placeholder throws.
 */
const OFFER_TOKENS: Record<string, string> = {
  SOLO_PRICE: `$${SOLO_PRICE}`,
  SOLO_MONTHLY_TERMS,
};

function fillOffer<T>(value: T): T {
  if (typeof value === "string") {
    return value.replace(/\{\{(\w+)\}\}/g, (_m, key: string) => {
      const v = OFFER_TOKENS[key];
      if (v === undefined) throw new Error(`Unknown comparison placeholder {{${key}}}`);
      return v;
    }) as T;
  }
  if (Array.isArray(value)) return value.map(fillOffer) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, fillOffer(v)]),
    ) as T;
  }
  return value;
}

/**
 * Manifest of every competitor comparison published at /agentstack-vs-{slug}.
 *
 * The dynamic route reads this map to build generateStaticParams (so every
 * page is prerendered at build time + the HTML is fully crawlable from the
 * initial response — no React hydration required to see body copy), and
 * the AgentStack footer reads it to build the Compare column.
 *
 * Add a new competitor:
 *   1. Create src/data/comparisons/{slug}.ts exporting a Comparison.
 *   2. Add it to the COMPARISONS map below.
 *   3. Done — route, sitemap, footer, schema all pick it up automatically.
 */
export const COMPARISONS: Record<string, Comparison> = {
  [gohighlevelComparison.slug]: gohighlevelComparison,
  [followUpBossData.slug]: fillOffer(followUpBossData as Comparison),
  [kvcoreData.slug]: fillOffer(kvcoreData as Comparison),
};

export const COMPARISON_SLUGS = Object.keys(COMPARISONS);

export function getComparison(slug: string): Comparison | null {
  return COMPARISONS[slug] ?? null;
}

export function listComparisons(): Comparison[] {
  return Object.values(COMPARISONS);
}

export function getComparisonPath(slug: string): string {
  return `/compare/${slug}`;
}
