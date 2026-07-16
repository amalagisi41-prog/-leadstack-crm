import type { Metadata } from "next";
import {
  buildPublicComparisonMetadata,
  PublicComparisonRoute,
} from "@/components/compare/render-public-comparison-route";

export const metadata: Metadata = buildPublicComparisonMetadata("gohighlevel");

export default function CompareGoHighLevelPage() {
  return <PublicComparisonRoute slug="gohighlevel" />;
}
