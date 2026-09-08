import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountAdmin, requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { buildContentBrief } from "@/lib/marketing/content-brief";
import type { CampaignBriefDoc } from "@/types/marketing-campaigns";
import type { IdxListingDoc } from "@/types/idx";
import type { SubAccountDoc } from "@/types";

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
  if (sub.idxEnabledByAgency !== true || !sub.idxConfig?.enabled) {
    return NextResponse.json({ error: "IDX Listings is not enabled for this sub-account." }, { status: 403 });
  }
  let body: Record<string, unknown>;
  try { body = (await request.json()) as Record<string, unknown>; } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const mlsId = typeof body.mlsId === "string" ? body.mlsId.trim() : "";
  let listing: IdxListingDoc | null = null;
  if (mlsId) {
    const match = await db.collection(`subAccounts/${id}/idxListings`).where("mlsId", "==", mlsId).limit(1).get();
    if (match.empty) return NextResponse.json({ error: "No synced IDX listing matched that MLS number." }, { status: 404 });
    listing = { id: match.docs[0].id, ...(match.docs[0].data() as Omit<IdxListingDoc, "id">) };
  } else {
    const text = (key: string) => typeof body[key] === "string" ? String(body[key]).trim() : "";
    const number = (key: string) => typeof body[key] === "number" && Number.isFinite(body[key]) ? Number(body[key]) : 0;
    const photos = Array.isArray(body.photos) ? body.photos.filter((p): p is string => typeof p === "string" && /^https:\/\//i.test(p)) : [];
    if (!text("address") || !text("city") || !text("state")) {
      return NextResponse.json({ error: "MLS number or address, city, and state are required." }, { status: 400 });
    }
    listing = {
      id: `manual-${Date.now()}`, subAccountId: id, mlsId: "manual", status: "active",
      price: number("price"), address: text("address"), city: text("city"), state: text("state"), zip: text("zip"),
      beds: number("beds"), baths: number("baths"), sqft: number("sqft") || null, yearBuilt: number("yearBuilt") || null,
      propertyType: text("propertyType") || "home", photos, remarks: text("remarks"), listingAgentName: null,
      listingOfficeName: null, disclaimer: text("disclaimer") || null, lat: null, lng: null, raw: {},
      syncedAt: FieldValue.serverTimestamp(),
    };
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
