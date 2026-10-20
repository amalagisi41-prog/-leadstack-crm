import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { formatCurrency } from "@/lib/format";
import { renderImage, placidIsConfigured, PlacidError } from "@/lib/creative/placid-client";
import type { CampaignBriefDoc } from "@/types/marketing-campaigns";
import type { SubAccountDoc } from "@/types/tenancy";

/**
 * POST /api/sub-accounts/[id]/marketing/campaigns/[listingId]/image
 * Body: { test?: boolean } — defaults to true (free, watermarked preview).
 * Pass test: false only once the operator is ready to spend a real credit —
 * matches this tool's "operator-explicit" approval level.
 *
 * Fills the brief's own verified facts into the operator's Placid template
 * (SubAccountDoc.placidTemplateId) — the template's layer names are fixed by
 * convention (photo/price/beds_baths/address); the operator's template must
 * use those names.
 */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string; listingId: string }> }
) {
  const { id, listingId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, id);
  if (access instanceof NextResponse) return access;

  if (!placidIsConfigured()) {
    return NextResponse.json(
      { error: "PLACID_API_TOKEN is not set on this deployment. Set it to enable branded image generation." },
      { status: 503 }
    );
  }

  const db = getAdminDb();
  const [subSnap, briefSnap] = await Promise.all([
    db.doc(`subAccounts/${id}`).get(),
    db.doc(`subAccounts/${id}/campaignBriefs/${listingId}`).get(),
  ]);
  const templateId = (subSnap.data() as SubAccountDoc | undefined)?.placidTemplateId;
  if (!templateId) {
    return NextResponse.json(
      { error: "Set a Placid template id for this workspace before generating a branded image." },
      { status: 400 }
    );
  }
  if (!briefSnap.exists) {
    return NextResponse.json({ error: "Campaign brief not found." }, { status: 404 });
  }
  const brief = briefSnap.data() as Omit<CampaignBriefDoc, "id">;
  const content = brief.brief;
  if (!content.images[0]) {
    return NextResponse.json(
      { error: "This listing has no photo to put in the template yet." },
      { status: 400 }
    );
  }

  let body: { test?: unknown } = {};
  try {
    body = (await request.json()) as { test?: unknown };
  } catch {
    // empty body = default preview
  }
  const test = body.test !== false;

  const ref = db.doc(`subAccounts/${id}/campaignBriefs/${listingId}`);
  try {
    const result = await renderImage({
      templateId,
      test,
      layers: {
        photo: { image: content.images[0] },
        price: { text: formatCurrency(content.price, "USD") },
        beds_baths: { text: `${content.beds} bd · ${content.baths} ba` },
        address: { text: `${content.address}, ${content.city}, ${content.state}` },
      },
    });
    const now = FieldValue.serverTimestamp();
    const creativeImage = {
      status: result.status === "finished" ? ("ready" as const) : result.status === "failed" ? ("failed" as const) : ("processing" as const),
      templateId,
      imageUrl: result.imageUrl,
      error: result.error,
      requestedByUid: access.uid,
      requestedAt: now,
    };
    await ref.update({ creativeImage, updatedAt: now });
    return NextResponse.json({ ok: true, creativeImage, placidId: result.id, test });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof PlacidError
            ? error.message
            : error instanceof Error
              ? error.message
              : "Could not generate the image.",
      },
      { status: 502 }
    );
  }
}
