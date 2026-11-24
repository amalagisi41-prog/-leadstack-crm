import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { getVideoJobStatus, CreatifyError } from "@/lib/creative/creatify-client";
import type { CampaignBriefDoc } from "@/types/marketing-campaigns";

/**
 * POST /api/sub-accounts/[id]/marketing/campaigns/[listingId]/video/poll
 *
 * On-demand status check — the operator's own UI calls this while waiting,
 * no QStash schedule behind it (v1; a scheduled sweep is a reasonable
 * follow-up if operators find themselves polling for a long time).
 */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string; listingId: string }> }
) {
  const { id, listingId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, id);
  if (access instanceof NextResponse) return access;

  const db = getAdminDb();
  const ref = db.doc(`subAccounts/${id}/campaignBriefs/${listingId}`);
  const snap = await ref.get();
  if (!snap.exists) {
    return NextResponse.json({ error: "Campaign brief not found." }, { status: 404 });
  }
  const brief = snap.data() as Omit<CampaignBriefDoc, "id">;
  const jobId = brief.video?.jobId;
  if (!jobId) {
    return NextResponse.json({ error: "No video job has been started for this listing." }, { status: 400 });
  }
  if (brief.video?.status === "ready" || brief.video?.status === "failed") {
    return NextResponse.json({ ok: true, video: brief.video });
  }

  try {
    const job = await getVideoJobStatus(jobId);
    const status = job.status === "done" ? "ready" : job.status === "failed" ? "failed" : "processing";
    const video = {
      status,
      jobId,
      videoUrl: job.videoUrl,
      error: job.error,
      requestedByUid: brief.video!.requestedByUid,
      requestedAt: brief.video!.requestedAt,
    };
    await ref.update({ video, updatedAt: FieldValue.serverTimestamp() });
    return NextResponse.json({ ok: true, video });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof CreatifyError
            ? error.message
            : error instanceof Error
              ? error.message
              : "Could not check video status.",
      },
      { status: 502 }
    );
  }
}
