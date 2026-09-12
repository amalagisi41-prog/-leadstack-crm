import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { buildContentBrief } from "@/lib/marketing/content-brief";
import type { IdxListingDoc, ListingMarketingStatus } from "@/types/idx";

const STATUS_TO_IDX: Record<ListingMarketingStatus, IdxListingDoc["status"]> = {
  new: "active",
  active: "active",
  "under-contract": "pending",
  "just-sold": "sold",
  "off-market": "off-market",
};

const STATUSES = new Set<ListingMarketingStatus>([
  "new",
  "active",
  "under-contract",
  "just-sold",
  "off-market",
]);

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string; listingId: string }> }
) {
  const { id, listingId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, id);
  if (access instanceof NextResponse) return access;
  let body: { status?: unknown };
  try {
    body = (await request.json()) as { status?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (typeof body.status !== "string" || !STATUSES.has(body.status as ListingMarketingStatus)) {
    return NextResponse.json({ error: "Choose a valid listing status." }, { status: 400 });
  }
  const marketingStatus = body.status as ListingMarketingStatus;
  const db = getAdminDb();
  const listingRef = db.doc("subAccounts/" + id + "/idxListings/" + listingId);
  const snap = await listingRef.get();
  if (!snap.exists) return NextResponse.json({ error: "Listing not found." }, { status: 404 });
  const listing = { id: snap.id, ...(snap.data() as Omit<IdxListingDoc, "id">) };
  const now = FieldValue.serverTimestamp();
  const updatedListing: IdxListingDoc = {
    ...listing,
    status: STATUS_TO_IDX[marketingStatus],
    marketingStatus,
    syncedAt: now,
  };
  await listingRef.set({ status: updatedListing.status, marketingStatus, syncedAt: now }, { merge: true });

  const briefRef = db.doc("subAccounts/" + id + "/campaignBriefs/" + listingId);
  const briefSnap = await briefRef.get();
  let brief: unknown = null;
  if (briefSnap.exists) {
    const current = briefSnap.data() as { agencyId: string; createdByUid: string };
    const rebuilt = buildContentBrief(updatedListing);
    await briefRef.set({ ...current, brief: rebuilt, approvedChannels: [], updatedAt: now }, { merge: true });
    brief = { id: briefSnap.id, ...current, brief: rebuilt };
  }
  await db.collection("subAccounts/" + id + "/listingStatusHistory").add({
    listingId,
    from: listing.marketingStatus ?? listing.status,
    to: marketingStatus,
    updatedByUid: access.uid,
    createdAt: now,
  });
  return NextResponse.json({ ok: true, listing: updatedListing, brief });
}
