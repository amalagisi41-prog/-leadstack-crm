import type { Metadata } from "next";
import {
  ComparisonRoute,
  buildComparisonMetadata,
} from "@/components/compare/render-comparison-route";

/**
 * /leadstack-vs-gohighlevel — public SEO comparison page.
 *
 * Pure server component. All body copy is rendered on the server and
 * lands in the initial HTML response (verified post-build with curl).
 * Adding the next competitor is two files: a new data file under
 * src/data/comparisons/, and a sibling app folder like this one with a
 * three-line page.tsx that swaps the slug literal.
 */

const SLUG = "gohighlevel";

export const metadata: Metadata = buildComparisonMetadata(SLUG);

export default function Page() {
  return <ComparisonRoute slug={SLUG} />;
}
