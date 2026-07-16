import type { Metadata } from "next";
import {
  buildPublicComparisonMetadata,
  PublicComparisonRoute,
} from "@/components/compare/render-public-comparison-route";

export const metadata: Metadata = buildPublicComparisonMetadata("kvcore");

export default function CompareKvcorePage() {
  return <PublicComparisonRoute slug="kvcore" />;
}
