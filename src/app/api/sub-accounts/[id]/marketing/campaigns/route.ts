import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountAdmin, requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { buildContentBrief } from "@/lib/marketing/content-brief";
import type { CampaignBriefDoc } from "@/types/marketing-campaigns";
import type { IdxListingDoc } from "@/types/idx";
import type { SubAccountDoc } from "@/types";
import { buildManualListing, isIdxCampaignEnabled, listingMatchesIdentifier } from "@/lib/marketing/campaign-route-helpers";
import { syncIdxListings } from "@/lib/idx/sync";

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const access = await requireSubAccountMember(request, id);
  if (access instanceof NextResponse) return access;
  const snap = await getAdminDb().collection(`subAccounts/${id}/campaignBriefs`).get();
  return NextResponse.json({
    ok: true,
    briefs: snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
  });
}

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const access = await requireSubAccountAdmin(request, id);
  if (access instanceof NextResponse) return access;
  const db = getAdminDb();
  const subSnap = await db.doc(`subAccounts/${id}`).get();
  if (!subSnap.exists) return NextResponse.json({ error: "Sub-account not found" }, { status: 404 });
  const sub = subSnap.data() as SubAccountDoc;
  if (!isIdxCampaignEnabled(sub)) {
    return NextResponse.json({ error: "IDX Listings is not enabled for this sub-account." }, { status: 403 });
  }
  let body: Record<string, unknown>;
  try { body = (await request.json()) as Record<string, unknown>; } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const mlsId = typeof body.mlsId === "string" ? body.mlsId.trim() : "";
  let listing: IdxListingDoc | null = null;
  if (mlsId) {
    const listingsCol = db.collection(`subAccounts/${id}/idxListings`);
    const direct = await listingsCol.doc(mlsId).get();
    if (direct.exists) {
      listing = { id: direct.id, ...(direct.data() as Omit<IdxListingDoc, "id">) };
    } else {
      const cached = await listingsCol.get();
      const found = cached.docs.find((doc) => listingMatchesIdentifier({ id: doc.id, ...(doc.data() as Omit<IdxListingDoc, "id">) }, mlsId));
      if (found) listing = { id: found.id, ...(found.data() as Omit<IdxListingDoc, "id">) };
    }
    if (!listing) {
      const sync = await syncIdxListings(id);
      if (sync.ok) {
        const refreshed = await listingsCol.get();
        const found = refreshed.docs.find((doc) => listingMatchesIdentifier({ id: doc.id, ...(doc.data() as Omit<IdxListingDoc, "id">) }, mlsId));
        if (found) listing = { id: found.id, ...(found.data() as Omit<IdxListingDoc, "id">) };
      }
    }
    if (!listing) return NextResponse.json({ error: "No matching featured listing was returned by your connected IDX Broker account. Try Sync now, confirm this property is one of your featured/agent listings, or use guided manual entry." }, { status: 404 });
  } else {
    const manual = buildManualListing(body, id);
    if (typeof manual === "string") return NextResponse.json({ error: manual }, { status: 400 });
    listing = manual;
  }
  const brief = buildContentBrief(listing);
  const ref = db.collection(`subAccounts/${id}/campaignBriefs`).doc(listing.id);
  const now = FieldValue.serverTimestamp();
  const payload: Omit<CampaignBriefDoc, "id"> = {
    agencyId: sub.agencyId, subAccountId: id, listingId: listing.id, createdByUid: access.uid,
    brief, approvedChannels: [], createdAt: now, updatedAt: now,
  };
  await ref.set(payload, { merge: true });
  return NextResponse.json({ ok: true, brief: { id: ref.id, ...payload } });
}
