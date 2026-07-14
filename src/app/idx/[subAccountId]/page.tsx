import Link from "next/link";
import { notFound } from "next/navigation";
import { getAdminDb } from "@/lib/firebase/admin";
import { getSubAccountSiteLinks } from "@/lib/public-site/site-links";
import { PublicSiteNav } from "@/components/public-site/public-site-nav";
import type { SubAccountDoc } from "@/types";
import type { IdxListingDoc } from "@/types/idx";

export const dynamic = "force-dynamic";

/**
 * Public IDX Listings search page — /idx/[subAccountId]. Plain GET-based
 * filters (no client JS required) over the sub-account's synced
 * `idxListings` subcollection. Always reads our own cached copy; never
 * proxies live to IDX Broker per visitor (see "IDX Listings (IDX Broker)
 * v1" — rate limits + MLS caching rules make a live proxy the wrong call).
 *
 * 404s when the agency gate is off or IDX Broker isn't connected, same
 * "don't reveal what's behind the gate" treatment public booking/quote
 * pages use for unpublished docs.
 */

interface PageProps {
  params: Promise<{ subAccountId: string }>;
  searchParams: Promise<{
    city?: string;
    minPrice?: string;
    maxPrice?: string;
    beds?: string;
  }>;
}

const PAGE_SIZE = 24;

export default async function IdxSearchPage({ params, searchParams }: PageProps) {
  const { subAccountId } = await params;
  const filters = await searchParams;

  const db = getAdminDb();
  const subSnap = await db.doc(`subAccounts/${subAccountId}`).get();
  if (!subSnap.exists) notFound();
  const sub = subSnap.data() as SubAccountDoc;
  if (sub.idxEnabledByAgency !== true || !sub.idxConfig?.enabled) notFound();

  let query: FirebaseFirestore.Query = db
    .collection(`subAccounts/${subAccountId}/idxListings`)
    .where("status", "==", "active");

  const minPrice = filters.minPrice ? Number(filters.minPrice) : null;
  const maxPrice = filters.maxPrice ? Number(filters.maxPrice) : null;
  if (minPrice) query = query.where("price", ">=", minPrice);
  if (maxPrice) query = query.where("price", "<=", maxPrice);
  query = query.orderBy("price", "asc").limit(PAGE_SIZE);

  const snap = await query.get();
  let listings = snap.docs.map((d) => d.data() as IdxListingDoc);

  // City/beds filters applied in-memory — keeps the composite-index surface
  // small (price is the one range filter that needs to compose with an
  // orderBy). Fine at this scale; revisit if a market's listing count grows
  // large enough to need it server-side.
  if (filters.city) {
    const city = filters.city.trim().toLowerCase();
    listings = listings.filter((l) => l.city.toLowerCase() === city);
  }
  if (filters.beds) {
    const minBeds = Number(filters.beds);
    if (Number.isFinite(minBeds)) {
      listings = listings.filter((l) => l.beds >= minBeds);
    }
  }

  const displayName = sub.idxConfig.displayName || sub.name || "Listings";
  const links = await getSubAccountSiteLinks(subAccountId);

  return (
    <div className="min-h-screen bg-neutral-50">
      <PublicSiteNav sub={sub} links={links} current="listings" />

      <main className="mx-auto max-w-6xl px-4 py-8">
        <p className="mb-6 text-sm text-neutral-500">Search current listings</p>
        <form className="mb-8 flex flex-wrap items-end gap-3 rounded-xl border bg-white p-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="city" className="text-xs font-medium text-neutral-600">
              City
            </label>
            <input
              id="city"
              name="city"
              defaultValue={filters.city ?? ""}
              className="w-40 rounded-md border px-3 py-1.5 text-sm"
              placeholder="Any"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="minPrice" className="text-xs font-medium text-neutral-600">
              Min price
            </label>
            <input
              id="minPrice"
              name="minPrice"
              type="number"
              defaultValue={filters.minPrice ?? ""}
              className="w-32 rounded-md border px-3 py-1.5 text-sm"
              placeholder="Any"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="maxPrice" className="text-xs font-medium text-neutral-600">
              Max price
            </label>
            <input
              id="maxPrice"
              name="maxPrice"
              type="number"
              defaultValue={filters.maxPrice ?? ""}
              className="w-32 rounded-md border px-3 py-1.5 text-sm"
              placeholder="Any"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="beds" className="text-xs font-medium text-neutral-600">
              Min beds
            </label>
            <input
              id="beds"
              name="beds"
              type="number"
              defaultValue={filters.beds ?? ""}
              className="w-24 rounded-md border px-3 py-1.5 text-sm"
              placeholder="Any"
            />
          </div>
          <button
            type="submit"
            className="rounded-md bg-neutral-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-neutral-800"
          >
            Search
          </button>
        </form>

        {listings.length === 0 ? (
          <div className="rounded-xl border border-dashed bg-white p-10 text-center text-sm text-neutral-500">
            No listings match your search right now. Check back soon.
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {listings.map((listing) => (
              <Link
                key={listing.id}
                href={`/idx/${subAccountId}/${listing.id}`}
                className="group overflow-hidden rounded-xl border bg-white transition-shadow hover:shadow-md"
              >
                <div className="aspect-[4/3] w-full overflow-hidden bg-neutral-100">
                  {listing.photos[0] ? (
                    // eslint-disable-next-line @next/next/no-img-element -- arbitrary IDX Broker CDN host
                    <img
                      src={listing.photos[0]}
                      alt={listing.address}
                      className="h-full w-full object-cover transition-transform group-hover:scale-[1.02]"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-neutral-400">
                      No photo
                    </div>
                  )}
                </div>
                <div className="p-4">
                  <p className="text-lg font-semibold text-neutral-900">
                    ${listing.price.toLocaleString()}
                  </p>
                  <p className="mt-0.5 truncate text-sm text-neutral-700">
                    {listing.address}
                  </p>
                  <p className="text-xs text-neutral-500">
                    {listing.city}, {listing.state}
                  </p>
                  <p className="mt-2 text-xs text-neutral-500">
                    {listing.beds} bd · {listing.baths} ba
                    {listing.sqft ? ` · ${listing.sqft.toLocaleString()} sqft` : ""}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}

        <p className="mt-8 text-center text-xs text-neutral-400">{displayName}</p>
      </main>
    </div>
  );
}
