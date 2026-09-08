import { notFound, redirect } from "next/navigation";
import { getAdminDb } from "@/lib/firebase/admin";
import { listingSlug } from "@/lib/idx/listing-slug";

export const dynamic = "force-dynamic";

export default async function KeywordListingPage({ params }: { params: Promise<{ subAccountId: string; slug: string }> }) {
  const { subAccountId, slug } = await params;
  const snap = await getAdminDb().collection(`subAccounts/${subAccountId}/idxListings`).get();
  const match = snap.docs.find((doc) => {
    const data = doc.data() as { address?: string; city?: string };
    return listingSlug(data.address ?? "", data.city ?? "") === slug;
  });
  if (!match) notFound();
  redirect(`/idx/${subAccountId}/${match.id}`);
}
