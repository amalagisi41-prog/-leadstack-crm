import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { firecrawlIsConfigured, scrapeUrl, FirecrawlError } from "@/lib/firecrawl/client";
import { normalizeAddressKey, stableListingId } from "@/lib/marketing/listing-dedupe";
import { MARKETING_STATUS_TO_IDX_STATUS } from "@/lib/marketing/listing-source";
import { parseListingsFromMarkdown } from "@/lib/marketing/listings-scrape";
import type { IdxListingDoc } from "@/types/idx";
import type {
  ListingsImportSourceClient,
  ListingsImportSourceDoc,
} from "@/types/listings-import";

/**
 * Scrapes a sub-account's saved public listings page and upserts each
 * property into `idxListings` — the same collection the manual upload flow
 * and the IDX Broker sync write to, so the Listings browser, the campaign
 * composer, and Website Studio's featured-listing cards all see one
 * inventory regardless of where a property came from.
 *
 * Shared by the operator's "Sync now" action (inline, synchronous — a
 * single-page Firecrawl scrape finishes in a few seconds, same as the AI
 * Agent's refresh-kb) and the weekly QStash-scheduled fan-out
 * (`/api/cron/listings-source-sync` -> `/api/marketing/listings-source/sync-step`).
 */

const SOURCE_DOC = (subAccountId: string) =>
  `subAccounts/${subAccountId}/listingsImportSource/main`;

/** See `ListingsImportSourceClient`'s doc comment for why this exists. */
export function serializeListingsImportSource(
  data: Record<string, unknown> | undefined,
): ListingsImportSourceClient | null {
  if (!data) return null;
  const lastSyncedAt = data.lastSyncedAt;
  const millis =
    lastSyncedAt &&
    typeof (lastSyncedAt as { toMillis?: () => number }).toMillis === "function"
      ? (lastSyncedAt as { toMillis: () => number }).toMillis()
      : null;
  return {
    url: typeof data.url === "string" ? data.url : "",
    status:
      data.status === "processing" ||
      data.status === "ready" ||
      data.status === "failed"
        ? data.status
        : "pending",
    errorMessage: typeof data.errorMessage === "string" ? data.errorMessage : null,
    propertyCount: typeof data.propertyCount === "number" ? data.propertyCount : 0,
    lastSyncedAt: millis,
  };
}

export interface ListingsSourceSyncResult {
  ok: boolean;
  propertyCount: number;
  error?: string;
}

export async function syncListingsFromSource(
  subAccountId: string,
): Promise<ListingsSourceSyncResult> {
  const db = getAdminDb();
  const ref = db.doc(SOURCE_DOC(subAccountId));
  const snap = await ref.get();
  if (!snap.exists) {
    return { ok: false, propertyCount: 0, error: "No listings page is connected." };
  }
  const source = snap.data() as ListingsImportSourceDoc;

  const fail = async (message: string) => {
    await ref.set(
      { status: "failed", errorMessage: message, updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
    return { ok: false, propertyCount: 0, error: message };
  };

  if (!firecrawlIsConfigured()) {
    return fail(
      "Firecrawl is not configured on this deployment. Set FIRECRAWL_API_KEY.",
    );
  }

  await ref.set({ status: "processing", updatedAt: FieldValue.serverTimestamp() }, { merge: true });

  let markdown: string;
  try {
    markdown = (await scrapeUrl(source.url)).markdown;
  } catch (err) {
    if (err instanceof FirecrawlError) return fail(err.message);
    console.error(`[listings-source] sa=${subAccountId} scrape failed:`, err);
    return fail("Failed to fetch the listings page. Try again in a minute.");
  }

  const cards = parseListingsFromMarkdown(markdown);
  if (cards.length === 0) {
    return fail(
      "Couldn't find any properties on that page. Check the URL points at a page that lists individual properties.",
    );
  }

  const listingsRef = db.collection(`subAccounts/${subAccountId}/idxListings`);
  const seenIds = new Set<string>();
  for (const card of cards) {
    const addressKey = normalizeAddressKey(card.address, card.city, card.state);
    const id = stableListingId(addressKey);
    seenIds.add(id);
    const listingRef = listingsRef.doc(id);
    const existing = await listingRef.get();
    const priorRaw = (existing.data()?.raw as Record<string, unknown>) ?? {};
    const priorData = existing.data() as Partial<IdxListingDoc> | undefined;
    await listingRef.set(
      {
        id,
        subAccountId,
        mlsId: id,
        status: MARKETING_STATUS_TO_IDX_STATUS[card.marketingStatus],
        marketingStatus: card.marketingStatus,
        price: card.price,
        address: card.address,
        city: card.city,
        state: card.state,
        // Facts this scrape cannot see stay whatever they already were —
        // never invent a bed/bath/sqft count the source page didn't show.
        zip: priorData?.zip ?? "",
        beds: priorData?.beds ?? 0,
        baths: priorData?.baths ?? 0,
        sqft: priorData?.sqft ?? null,
        yearBuilt: priorData?.yearBuilt ?? null,
        propertyType: priorData?.propertyType ?? "home",
        photos: priorData?.photos ?? [],
        remarks: card.remarks,
        listingAgentName: priorData?.listingAgentName ?? null,
        listingOfficeName: priorData?.listingOfficeName ?? null,
        disclaimer: priorData?.disclaimer ?? null,
        lat: priorData?.lat ?? null,
        lng: priorData?.lng ?? null,
        raw: {
          ...priorRaw,
          importedFrom: "listings page sync",
          sourceUrl: source.url,
          addressKey,
          tags: card.tags,
        },
        syncedAt: FieldValue.serverTimestamp(),
      } satisfies Omit<IdxListingDoc, "syncedAt"> & { syncedAt: FieldValue },
      { merge: true },
    );
  }

  // A property this source wrote before but didn't see this time came down
  // off the page — flip it to off-market rather than deleting it, same as
  // the IDX sync does for a listing that drops out of the MLS feed. Leads
  // and campaign history tied to the record survive.
  const priorFromThisSource = await listingsRef
    .where("raw.sourceUrl", "==", source.url)
    .get();
  for (const doc of priorFromThisSource.docs) {
    if (seenIds.has(doc.id)) continue;
    if (doc.data().status === "off-market") continue;
    await doc.ref.set(
      {
        status: "off-market",
        marketingStatus: "off-market",
        syncedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  }

  await ref.set(
    {
      status: "ready",
      errorMessage: null,
      propertyCount: cards.length,
      lastSyncedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  return { ok: true, propertyCount: cards.length };
}
