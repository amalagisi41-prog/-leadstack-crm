import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import {
  createImageToVideoJob,
  creatifyIsConfigured,
  CreatifyError,
} from "@/lib/creative/creatify-client";
import type { CampaignBriefDoc } from "@/types/marketing-campaigns";

/**
 * POST /api/sub-accounts/[id]/marketing/campaigns/[listingId]/video
 *
 * Starts a Creatify image-to-video job from the brief's own first photo and
 * its landing-page copy as the script — never invented text. Async: writes
 * a `queued` state onto the brief doc and returns immediately; the operator
 * (or a poll call) checks back via the sibling /video/poll route.
 */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string; listingId: string }> }
) {
  const { id, listingId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, id);
  if (access instanceof NextResponse) return access;

  if (!creatifyIsConfigured()) {
    return NextResponse.json(
      {
        error:
          "CREATIFY_API_ID/CREATIFY_API_KEY are not set on this deployment. Set them to enable video generation.",
      },
      { status: 503 }
    );
  }

  const db = getAdminDb();
  const ref = db.doc(`subAccounts/${id}/campaignBriefs/${listingId}`);
  const snap = await ref.get();
  if (!snap.exists) {
    return NextResponse.json({ error: "Campaign brief not found." }, { status: 404 });
  }
  const brief = snap.data() as Omit<CampaignBriefDoc, "id">;

  const imageUrl = brief.brief.images[0];
  if (!imageUrl) {
    return NextResponse.json(
      { error: "This listing has no photo to turn into a video yet." },
      { status: 400 }
    );
  }
  const landingCopy = brief.brief.channels.find((c) => c.channel === "landingPage")?.body;
  const script = landingCopy ?? brief.brief.description;

  try {
    const { jobId } = await createImageToVideoJob({ imageUrl, script });
    const now = FieldValue.serverTimestamp();
    await ref.update({
      video: {
        status: "queued",
        jobId,
        videoUrl: null,
        error: null,
        requestedByUid: access.uid,
        requestedAt: now,
      },
      updatedAt: now,
    });
    return NextResponse.json({ ok: true, jobId, status: "queued" });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof CreatifyError
            ? error.message
            : error instanceof Error
              ? error.message
              : "Could not start video generation.",
      },
      { status: 502 }
    );
  }
}
