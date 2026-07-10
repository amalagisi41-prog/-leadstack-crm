import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import {
  fetchIdxListings,
  type IdxBrokerRawListing,
} from "@/lib/idx/broker-client";
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
  const id = strOrNull(raw.listingID);
  if (!id) return null;
  return {
    id,
    subAccountId,
    mlsId,
    status: normalizeStatus(raw.idxStatus),
    price: num(raw.listingPrice),
    address: str(raw.address),
    city: str(raw.cityName),
    state: str(raw.state),
    zip: str(raw.zipcode),
    beds: num(raw.bedrooms),
    baths: num(raw.totalBaths),
    sqft: numOrNull(raw.sqFt),
    yearBuilt: numOrNull(raw.yearBuilt),
    propertyType: str(raw.propType),
    photos: normalizePhotos(raw.image),
    remarks: str(raw.remarksConcat),
    listingAgentName: strOrNull(raw.listingAgentName),
    listingOfficeName: strOrNull(raw.officeName),
    disclaimer: strOrNull(raw.disclaimer),
    lat: numOrNull(raw.latitude),
    lng: numOrNull(raw.longitude),
    raw,
    syncedAt: FieldValue.serverTimestamp(),
  };
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
  if (!cfg?.enabled || !cfg.accessKey) {
    return { ok: false, listingCount: 0, error: "IDX Broker isn't connected." };
  }
  if (!cfg.mlsId) {
    return {
      ok: false,
      listingCount: 0,
      error: "Pick an MLS id in IDX Listings settings before syncing.",
    };
  }

  await subRef.set(
    { idxConfig: { ...cfg, lastSyncStatus: "syncing" } },
    { merge: true },
  );

  try {
    const raw = await fetchIdxListings(cfg.accessKey, cfg.mlsId);
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
    const existingSnap = await listingsCol
      .where("status", "!=", "off-market")
      .get();
    const staleDocs = existingSnap.docs.filter((d) => !seenIds.has(d.id));
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
          ...cfg,
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
            ...cfg,
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
