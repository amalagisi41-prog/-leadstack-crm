import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import {
  fetchIdxListings,
  type IdxBrokerRawListing,
} from "@/lib/idx/broker-client";
import { loadIdxSecrets } from "@/lib/comms/sub-account-secrets";
import { describeListingSource } from "@/lib/marketing/listing-source";
import type { IdxConfig } from "@/types";
import type { IdxListingDoc } from "@/types/idx";

const BATCH_OP_LIMIT = 400; // stay under Firestore's 500-op batch cap

function num(v: unknown): number {
  const n = typeof v === "string" ? Number.parseFloat(v) : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function numOrNull(v: unknown): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = typeof v === "string" ? Number.parseFloat(v) : Number(v);
  return Number.isFinite(n) ? n : null;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

function strOrNull(v: unknown): string | null {
  const s = str(v).trim();
  return s.length > 0 ? s : null;
}

function normalizeStatus(raw: unknown): IdxListingDoc["status"] {
  const s = str(raw).toLowerCase();
  if (s.includes("pend")) return "pending";
  if (s.includes("sold") || s.includes("closed")) return "sold";
  if (s.includes("active")) return "active";
  return "active";
}

function normalizePhotos(raw: IdxBrokerRawListing["image"]): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => (typeof entry === "string" ? entry : entry?.url))
    .filter((url): url is string => typeof url === "string" && url.length > 0);
}

function normalizeListing(
  raw: IdxBrokerRawListing,
  subAccountId: string,
  mlsId: string,
): IdxListingDoc | null {
  const value = (...keys: string[]) =>
    keys.map((key) => raw[key]).find((candidate) => candidate != null && str(candidate).trim() !== "");
  const id = strOrNull(value("listingID", "listingId", "listingNumber", "listing_number", "mlsNumber", "mlsID", "mlsId", "mls"));
  if (!id) return null;
  return {
    id,
    subAccountId,
    mlsId,
    status: normalizeStatus(raw.idxStatus),
    price: num(value("listingPrice", "price", "listPrice")),
    address: str(value("address", "streetAddress", "street")),
    city: str(value("cityName", "city")),
    state: str(value("state", "stateCode", "stateAbbr")),
    zip: str(value("zipcode", "zip", "postalCode")),
    beds: num(value("bedrooms", "beds")),
    baths: num(value("totalBaths", "baths", "bathrooms")),
    sqft: numOrNull(value("sqFt", "sqft", "squareFeet", "livingArea")),
    yearBuilt: numOrNull(value("yearBuilt", "built")),
    propertyType: str(value("propType", "propertyType", "type")),
    photos: normalizePhotos(value("image", "images", "photos") as IdxBrokerRawListing["image"]),
    remarks: str(value("remarksConcat", "remarks", "publicRemarks", "description")),
    listingAgentName: strOrNull(value("listingAgentName", "listingAgent", "agentName")),
    listingOfficeName: strOrNull(value("officeName", "listingOfficeName", "brokerage")),
    disclaimer: strOrNull(value("disclaimer", "mlsDisclaimer", "attribution")),
    lat: numOrNull(value("latitude", "lat")),
    lng: numOrNull(value("longitude", "lng", "lon")),
    raw,
    syncedAt: FieldValue.serverTimestamp(),
  };
}

/**
 * Should a listing already in the collection be flipped to off-market because
 * this sync pass did not return it?
 *
 * Only ever true for FEED-sourced listings. The collection holds hand-added
 * off-market property alongside the MLS feed, and "absent from the feed" says
 * nothing about a property that was never in it. Getting this wrong meant
 * every sync rewrote the operator's own pocket listings and past sales to
 * off-market — and a sync that legitimately returned zero listings did it to
 * the whole workspace at once.
 *
 * Pure and exported so the rule can be tested without a Firestore round trip;
 * it is easier to reason about here than inside the batch loop that applies it.
 */
export function shouldMarkOffMarket(
  listing: { id?: unknown; raw?: unknown } | null | undefined,
  seenListingIds: ReadonlySet<string>,
  docId: string
): boolean {
  if (!listing) return false;
  if (seenListingIds.has(docId)) return false;
  return describeListingSource(listing).isFeedSourced;
}

export interface SyncResult {
  ok: boolean;
  listingCount: number;
  error?: string;
}

/**
 * Syncs one sub-account's active listings from IDX Broker into
 * `subAccounts/{id}/idxListings/{listingId}`. Called both by the manual
 * "Sync now" route and the scheduled QStash step worker — always resolves
 * gracefully (never throws), recording the outcome on `idxConfig` so the
 * Settings section + operator dashboard can surface it.
 */
export async function syncIdxListings(subAccountId: string): Promise<SyncResult> {
  const db = getAdminDb();
  const subRef = db.doc(`subAccounts/${subAccountId}`);
  const subSnap = await subRef.get();
  if (!subSnap.exists) {
    return { ok: false, listingCount: 0, error: "Sub-account not found." };
  }
  const sub = subSnap.data() as Record<string, unknown>;
  if (sub.idxEnabledByAgency !== true) {
    return { ok: false, listingCount: 0, error: "IDX Listings is disabled by the agency." };
  }
  const cfg = sub.idxConfig as IdxConfig | null | undefined;
  const idxSecrets = cfg?.enabled ? await loadIdxSecrets(subAccountId) : null;
  if (!cfg?.enabled || !idxSecrets) {
    return { ok: false, listingCount: 0, error: "IDX Broker isn't connected." };
  }
  if (!cfg.mlsId) {
    return {
      ok: false,
      listingCount: 0,
      error: "Pick an MLS id in IDX Listings settings before syncing.",
    };
  }

  // `accessKey` is destructured out, not merely absent: spreading the config
  // back onto the parent document is precisely how a migrated credential would
  // get silently re-inlined onto a member-readable doc.
  //
  // EVERY write below must use `publicCfg`, not `cfg`. `cfg` was read from the
  // parent document a few lines above; `loadIdxSecrets()` has since migrated
  // any legacy inline key into the server-only secrets subcollection, which
  // DELETES it from the parent. So `cfg` still holds the key in memory after
  // Firestore has dropped it, and writing `{...cfg}` back would restore the
  // credential onto a document every member of the sub-account can read —
  // undoing the migration on every successful sync. The two writes below did
  // exactly that until this was fixed.
  const { accessKey: _accessKey, ...publicCfg } = cfg;
  await subRef.set(
    { idxConfig: { ...publicCfg, connected: true, lastSyncStatus: "syncing" } },
    { merge: true },
  );

  try {
    const raw = await fetchIdxListings(idxSecrets.accessKey);
    const listingsCol = db.collection(`subAccounts/${subAccountId}/idxListings`);
    const normalized = raw
      .map((r) => normalizeListing(r, subAccountId, cfg.mlsId as string))
      .filter((l): l is IdxListingDoc => l !== null);
    const seenIds = new Set(normalized.map((l) => l.id));

    // Upsert every listing seen this pass, batched under Firestore's op cap.
    for (let i = 0; i < normalized.length; i += BATCH_OP_LIMIT) {
      const batch = db.batch();
      for (const listing of normalized.slice(i, i + BATCH_OP_LIMIT)) {
        batch.set(listingsCol.doc(listing.id), listing, { merge: false });
      }
      await batch.commit();
    }

    // Flip any previously-synced listing not seen this pass to off-market —
    // never hard-delete, so a bookmarked detail-page URL keeps resolving.
    //
    // **Feed-sourced listings only.** This collection holds hand-added
    // off-market property alongside the MLS feed, and "absent from the feed"
    // says nothing about a property that was never in it. Without this
    // filter, every sync flipped the operator's own pocket listings,
    // coming-soons and past sales to off-market — and a sync that legitimately
    // returned zero listings flipped the entire workspace, silently rewriting
    // statuses a person had set by hand. `isFeedSourced` is the same
    // distinction the Listings screen and the disclaimer rules use; staleness
    // is one more thing that must respect it.
    const existingSnap = await listingsCol
      .where("status", "!=", "off-market")
      .get();
    const staleDocs = existingSnap.docs.filter((d) =>
      shouldMarkOffMarket(d.data(), seenIds, d.id)
    );
    for (let i = 0; i < staleDocs.length; i += BATCH_OP_LIMIT) {
      const batch = db.batch();
      for (const doc of staleDocs.slice(i, i + BATCH_OP_LIMIT)) {
        batch.update(doc.ref, { status: "off-market" });
      }
      await batch.commit();
    }

    const listingCount = normalized.filter((l) => l.status === "active").length;
    await subRef.set(
      {
        idxConfig: {
          ...publicCfg,
          lastSyncAt: FieldValue.serverTimestamp(),
          lastSyncStatus: "success",
          lastSyncError: null,
          listingCount,
        },
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    return { ok: true, listingCount };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync failed.";
    await subRef
      .set(
        {
          idxConfig: {
            ...publicCfg,
            lastSyncAt: FieldValue.serverTimestamp(),
            lastSyncStatus: "failed",
            lastSyncError: message,
          },
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      )
      .catch(() => undefined);
    return { ok: false, listingCount: 0, error: message };
  }
}
