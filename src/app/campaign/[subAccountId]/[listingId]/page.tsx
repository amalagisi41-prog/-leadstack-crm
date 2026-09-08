import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAdminDb } from "@/lib/firebase/admin";
import { SinglePropertyTemplate } from "@/components/website-studio/single-property-template";
import type { CampaignBriefDoc } from "@/types/marketing-campaigns";

export const dynamic = "force-dynamic";

async function readBrief(subAccountId: string, listingId: string) {
  const snap = await getAdminDb().doc(`subAccounts/${subAccountId}/campaignBriefs/${listingId}`).get();
  if (!snap.exists) return null;
  const brief = snap.data() as Omit<CampaignBriefDoc, "id">;
  if (!brief.approvedChannels.includes("landingPage")) return null;
  return brief.brief;
}

export async function generateMetadata({ params }: { params: Promise<{ subAccountId: string; listingId: string }> }): Promise<Metadata> {
  const { subAccountId, listingId } = await params;
  const brief = await readBrief(subAccountId, listingId);
  return brief ? { title: brief.title, description: brief.description, openGraph: { title: brief.title, description: brief.description, images: brief.images[0] ? [brief.images[0]] : [] } } : { title: "Property campaign" };
}

export default async function CampaignLandingPage({ params }: { params: Promise<{ subAccountId: string; listingId: string }> }) {
  const { subAccountId, listingId } = await params;
  const brief = await readBrief(subAccountId, listingId);
  if (!brief) notFound();
  return <main className="min-h-screen bg-neutral-50 p-6"><SinglePropertyTemplate brief={brief} /></main>;
}
