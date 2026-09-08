import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getAdminDb } from "@/lib/firebase/admin";
import { getSubAccountSiteLinks } from "@/lib/public-site/site-links";
import { PublicSiteNav } from "@/components/public-site/public-site-nav";
import { ListingInquiryForm } from "@/components/idx/listing-inquiry-form";
import type { SubAccountDoc } from "@/types";
import type { IdxListingDoc } from "@/types/idx";

export const dynamic = "force-dynamic";

/**
 * Public IDX listing detail page — /idx/[subAccountId]/[listingId]. Renders
 * even for an "off-market" listing (the sync job never hard-deletes) so a
 * bookmarked/shared link keeps resolving; only 404s when the gate is off,
 * the sub-account/listing doesn't exist, or IDX Broker isn't connected.
 */

interface PageProps {
  params: Promise<{ subAccountId: string; listingId: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { subAccountId, listingId } = await params;
  const snap = await getAdminDb().doc(`subAccounts/${subAccountId}/idxListings/${listingId}`).get();
  if (!snap.exists) return { title: "Property listing" };
  const listing = snap.data() as IdxListingDoc;
  const title = `${listing.address}, ${listing.city}, ${listing.state}`;
  const description = `${listing.beds} bedroom, ${listing.baths} bathroom ${listing.propertyType} listed at $${listing.price.toLocaleString()}.`;
  return {
    title,
    description,
    openGraph: { title, description, type: "website", images: listing.photos[0] ? [{ url: listing.photos[0], alt: title }] : [] },
    twitter: { card: "summary_large_image", title, description, images: listing.photos[0] ? [listing.photos[0]] : [] },
  };
}

export default async function IdxListingDetailPage({ params }: PageProps) {
  const { subAccountId, listingId } = await params;
  const db = getAdminDb();

  const [subSnap, listingSnap] = await Promise.all([
    db.doc(`subAccounts/${subAccountId}`).get(),
    db.doc(`subAccounts/${subAccountId}/idxListings/${listingId}`).get(),
  ]);
  if (!subSnap.exists || !listingSnap.exists) notFound();
  const sub = subSnap.data() as SubAccountDoc;
  if (sub.idxEnabledByAgency !== true || !sub.idxConfig?.enabled) notFound();

  const listing = listingSnap.data() as IdxListingDoc;
  const isOffMarket = listing.status === "off-market" || listing.status === "sold";

  const links = await getSubAccountSiteLinks(subAccountId);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "RealEstateListing",
    name: `${listing.address}, ${listing.city}, ${listing.state}`,
    url: `${process.env.NEXT_PUBLIC_APP_URL ?? "https://agentstackcrm.app"}/idx/${subAccountId}/${listingId}`,
    image: listing.photos,
    offers: { "@type": "Offer", price: listing.price, priceCurrency: "USD" },
    address: { "@type": "PostalAddress", streetAddress: listing.address, addressLocality: listing.city, addressRegion: listing.state, postalCode: listing.zip },
    geo: listing.lat != null && listing.lng != null ? { "@type": "GeoCoordinates", latitude: listing.lat, longitude: listing.lng } : undefined,
    floorSize: listing.sqft ? { "@type": "QuantitativeValue", value: listing.sqft, unitCode: "FTK" } : undefined,
  };

  return (
    <div className="min-h-screen bg-neutral-50">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <PublicSiteNav sub={sub} links={links} current="listings" />

      <main className="mx-auto max-w-4xl px-4 py-8">
        <Link
          href={`/idx/${subAccountId}`}
          className="mb-4 inline-block text-sm font-medium text-neutral-600 hover:text-neutral-900"
        >
          ← All listings
        </Link>

        {isOffMarket && (
          <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-800">
            This listing is no longer active.
          </div>
        )}

        {listing.photos.length > 0 && (
          <div className="mb-6 grid gap-2 sm:grid-cols-2">
            {listing.photos.slice(0, 6).map((url, i) => (
              // eslint-disable-next-line @next/next/no-img-element -- arbitrary IDX Broker CDN host
              <img
                key={i}
                src={url}
                alt={`${listing.address} photo ${i + 1}`}
                className="aspect-[4/3] w-full rounded-lg object-cover"
              />
            ))}
          </div>
        )}

        <div className="grid gap-8 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <p className="text-2xl font-semibold text-neutral-900">
              ${listing.price.toLocaleString()}
            </p>
            <p className="mt-1 text-neutral-700">{listing.address}</p>
            <p className="text-sm text-neutral-500">
              {listing.city}, {listing.state} {listing.zip}
            </p>
            <p className="mt-3 text-sm text-neutral-600">
              {listing.beds} bd · {listing.baths} ba
              {listing.sqft ? ` · ${listing.sqft.toLocaleString()} sqft` : ""}
              {listing.propertyType ? ` · ${listing.propertyType}` : ""}
            </p>
            {listing.remarks && (
              <p className="mt-5 whitespace-pre-wrap text-sm leading-relaxed text-neutral-700">
                {listing.remarks}
              </p>
            )}
            {(listing.listingAgentName || listing.listingOfficeName) && (
              <p className="mt-5 text-xs text-neutral-500">
                Listed by {listing.listingAgentName}
                {listing.listingAgentName && listing.listingOfficeName ? ", " : ""}
                {listing.listingOfficeName}
              </p>
            )}
            {listing.disclaimer && (
              <p className="mt-4 text-[11px] leading-relaxed text-neutral-400">
                {listing.disclaimer}
              </p>
            )}
          </div>

          <div className="sm:col-span-1">
            {!isOffMarket && (
              <ListingInquiryForm subAccountId={subAccountId} listingId={listingId} />
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
