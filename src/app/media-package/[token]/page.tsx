import { notFound } from "next/navigation";
import { getAdminDb } from "@/lib/firebase/admin";
import type { CampaignBriefDoc } from "@/types/marketing-campaigns";
import type { IdxListingDoc } from "@/types/idx";

type ShareDoc = { subAccountId: string; listingId: string };

function value(value: string | number | null | undefined, fallback = "Not provided") {
  return value === null || value === undefined || value === "" ? fallback : String(value);
}

export default async function MediaPackagePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const db = getAdminDb();
  const shareSnap = await db.doc(`mediaPackageShares/${token}`).get();
  if (!shareSnap.exists) notFound();

  const share = shareSnap.data() as ShareDoc;
  const [briefSnap, listingSnap, packageSnap, assetsSnap] = await Promise.all([
    db.doc(`subAccounts/${share.subAccountId}/campaignBriefs/${share.listingId}`).get(),
    db.doc(`subAccounts/${share.subAccountId}/idxListings/${share.listingId}`).get(),
    db.doc(`subAccounts/${share.subAccountId}/mediaPackages/${share.listingId}`).get(),
    db
      .collection(`subAccounts/${share.subAccountId}/mediaAssets`)
      .where("propertyId", "==", share.listingId)
      .get(),
  ]);
  if (!briefSnap.exists) notFound();

  const brief = briefSnap.data() as Omit<CampaignBriefDoc, "id">;
  const listing = listingSnap.exists
    ? (listingSnap.data() as Omit<IdxListingDoc, "id">)
    : null;
  const mediaPackage = packageSnap.exists
    ? (packageSnap.data() as { brochureUrl?: string | null; sourceName?: string; photoCount?: number })
    : null;
  const assets = assetsSnap.docs
    .map((doc) => doc.data() as { name?: string; url?: string; role?: string })
    .filter((asset) => typeof asset.url === "string" && asset.url.length > 0);
  const title = brief.brief.address || "Property media package";
  const photos = [...new Set([...brief.brief.images, ...(listing?.photos ?? [])])];

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-950 sm:px-6">
      <div className="mx-auto max-w-4xl space-y-6">
        <header className="rounded-2xl border bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold tracking-[0.2em] text-slate-500 uppercase">Property media package</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-1 text-sm text-slate-600">
            {[brief.brief.city, brief.brief.state, brief.brief.zip].filter(Boolean).join(", ") || "Location not provided"}
          </p>
          <dl className="mt-5 grid gap-4 sm:grid-cols-4">
            {[
              ["Price", brief.brief.price ? `$${brief.brief.price.toLocaleString()}` : "Not provided"],
              ["Beds", value(brief.brief.beds)],
              ["Baths", value(brief.brief.baths)],
              ["Sq. ft.", value(brief.brief.sqft)],
            ].map(([label, item]) => (
              <div key={label}>
                <dt className="text-xs text-slate-500">{label}</dt>
                <dd className="mt-1 text-sm font-medium">{item}</dd>
              </div>
            ))}
          </dl>
        </header>

        <section className="rounded-2xl border bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold">Approved listing copy</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{brief.brief.description || "No approved remarks were saved."}</p>
          {brief.brief.disclaimer && <p className="mt-4 border-t pt-4 text-xs text-slate-500">{brief.brief.disclaimer}</p>}
        </section>

        <section className="rounded-2xl border bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold">Photos and files</h2>
            <span className="text-xs text-slate-500">{photos.length} photo{photos.length === 1 ? "" : "s"}</span>
          </div>
          {photos.length ? (
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {photos.map((photo, index) => <img key={`${photo}-${index}`} src={photo} alt={`${title} photo ${index + 1}`} className="aspect-[4/3] w-full rounded-lg border object-cover" />)}
            </div>
          ) : <p className="mt-4 rounded-lg border border-dashed p-4 text-sm text-slate-500">No photos were included in this package.</p>}
          {mediaPackage?.brochureUrl && <a className="mt-5 inline-flex text-sm font-medium text-blue-700 underline" href={mediaPackage.brochureUrl}>Download brochure PDF</a>}
          {assets.length > 0 && (
            <ul className="mt-4 space-y-2 border-t pt-4">
              {assets.map((asset, index) => <li key={`${asset.url}-${index}`}><a className="text-sm text-blue-700 underline" href={asset.url}>{asset.name || `${asset.role || "Property"} file ${index + 1}`}</a></li>)}
            </ul>
          )}
        </section>

        <section className="rounded-2xl border bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold">Marketing links</h2>
          <a
            className="mt-3 inline-flex text-sm font-medium text-blue-700 underline"
            href={`/idx/${share.subAccountId}/${share.listingId}`}
          >
            Open property listing page
          </a>
          <ul className="mt-3 space-y-2">
            {brief.brief.channels.map((draft) => <li key={draft.channel} className="flex items-center justify-between gap-3 border-b py-2 text-sm"><span className="capitalize">{draft.channel === "googleBusiness" ? "Google Business" : draft.channel}</span><span className="text-xs text-slate-500">{draft.status}</span></li>)}
          </ul>
          <p className="mt-4 text-xs text-slate-500">This package contains the approved materials selected by the listing owner. Confirm each channel’s publishing status before reposting.</p>
        </section>
      </div>
    </main>
  );
}
