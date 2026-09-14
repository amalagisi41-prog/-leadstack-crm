import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import type { CampaignBriefDoc } from "@/types/marketing-campaigns";

/**
 * Quick-edit of a property's core facts from the Properties list — address,
 * price, beds/baths/sqft, and type. Anything a full campaign edit could also
 * change; this route only exists so an operator doesn't have to open the
 * campaigns page for a one-field fix.
 */
export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string; listingId: string }> }
) {
  const { id, listingId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, id);
  if (access instanceof NextResponse) return access;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const db = getAdminDb();
  const ref = db.doc(`subAccounts/${id}/campaignBriefs/${listingId}`);
  const snap = await ref.get();
  if (!snap.exists)
    return NextResponse.json({ error: "Property not found." }, { status: 404 });
  const existing = snap.data() as Omit<CampaignBriefDoc, "id">;

  const text = (key: string) =>
    typeof body[key] === "string" ? (body[key] as string).trim() : undefined;
  const num = (key: string) =>
    typeof body[key] === "number" && Number.isFinite(body[key])
      ? (body[key] as number)
      : undefined;

  const address = text("address");
  const city = text("city");
  const state = text("state");
  if (address === "" || city === "" || state === "")
    return NextResponse.json(
      { error: "Address, city, and state can't be blank." },
      { status: 400 }
    );

  const patch: Partial<typeof existing.brief> = {};
  if (address !== undefined) patch.address = address;
  if (city !== undefined) patch.city = city;
  if (state !== undefined) patch.state = state;
  const zip = text("zip");
  if (zip !== undefined) patch.zip = zip;
  const price = num("price");
  if (price !== undefined) patch.price = price;
  const beds = num("beds");
  if (beds !== undefined) patch.beds = beds;
  const baths = num("baths");
  if (baths !== undefined) patch.baths = baths;
  if ("sqft" in body) patch.sqft = num("sqft") ?? null;
  const propertyType = text("propertyType");
  if (propertyType !== undefined) patch.propertyType = propertyType;

  const brief = { ...existing.brief, ...patch };
  await ref.set(
    { brief, updatedAt: FieldValue.serverTimestamp() },
    { merge: true }
  );
  return NextResponse.json({ ok: true, brief: { id: ref.id, ...existing, brief } });
}

/**
 * Removes a property from the operator's list. Only deletes the campaign
 * brief (drafts, approvals, schedule) for this listing — never the shared
 * `idxListings/{id}` sync doc, which belongs to the IDX feed, not the
 * campaign. Deleting a manually-entered property (no companion IDX doc)
 * behaves the same way: this route only ever touches `campaignBriefs`.
 */
export async function DELETE(
  request: Request,
  ctx: { params: Promise<{ id: string; listingId: string }> }
) {
  const { id, listingId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, id);
  if (access instanceof NextResponse) return access;

  const db = getAdminDb();
  const ref = db.doc(`subAccounts/${id}/campaignBriefs/${listingId}`);
  const snap = await ref.get();
  if (!snap.exists)
    return NextResponse.json({ error: "Property not found." }, { status: 404 });

  await ref.delete();
  return NextResponse.json({ ok: true });
}
