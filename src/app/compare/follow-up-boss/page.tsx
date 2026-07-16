import type { Metadata } from "next";
import {
  buildPublicComparisonMetadata,
  PublicComparisonRoute,
} from "@/components/compare/render-public-comparison-route";

export const metadata: Metadata =
  buildPublicComparisonMetadata("follow-up-boss");

export default function CompareFollowUpBossPage() {
  return <PublicComparisonRoute slug="follow-up-boss" />;
}
