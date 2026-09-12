import { notFound } from "next/navigation";
import { getAdminDb } from "@/lib/firebase/admin";
import { PropertyBrochure } from "@/components/marketing/property-brochure";
import type { CampaignBriefDoc } from "@/types/marketing-campaigns";

export const dynamic = "force-dynamic";

export default async function PropertyBrochurePage({ params }: { params: Promise<{ subAccountId: string; listingId: string }> }) {
  const { subAccountId, listingId } = await params;
  const snap = await getAdminDb().doc(`subAccounts/${subAccountId}/campaignBriefs/${listingId}`).get();
  if (!snap.exists) notFound();
  const brief = (snap.data() as Omit<CampaignBriefDoc, "id">).brief;
  return <main className="min-h-screen bg-slate-200 p-6 print:bg-white print:p-0"><PropertyBrochure brief={brief} /></main>;
}
