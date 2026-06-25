import type { Comparison } from "@/types/comparisons";
import { gohighlevelComparison } from "./gohighlevel";

/**
 * Manifest of every competitor comparison published at /leadstack-vs-{slug}.
 *
 * The dynamic route reads this map to build generateStaticParams (so every
 * page is prerendered at build time + the HTML is fully crawlable from the
 * initial response — no React hydration required to see body copy), and
 * the LeadStack footer reads it to build the Compare column.
 *
 * Add a new competitor:
 *   1. Create src/data/comparisons/{slug}.ts exporting a Comparison.
 *   2. Add it to the COMPARISONS map below.
 *   3. Done — route, sitemap, footer, schema all pick it up automatically.
 */
export const COMPARISONS: Record<string, Comparison> = {
  [gohighlevelComparison.slug]: gohighlevelComparison,
};

export const COMPARISON_SLUGS = Object.keys(COMPARISONS);

export function getComparison(slug: string): Comparison | null {
  return COMPARISONS[slug] ?? null;
}

export function listComparisons(): Comparison[] {
  return Object.values(COMPARISONS);
}
