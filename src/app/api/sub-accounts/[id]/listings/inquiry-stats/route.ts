import "server-only";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { summariseListingInquiries } from "@/lib/listings/inquiry-stats";

/**
 * GET /api/sub-accounts/[id]/listings/inquiry-stats
 *
 * How many inquiries each property has drawn, and when the most recent one
 * arrived. One query for the whole workspace rather than one per listing, so
 * the Listings screen can show every row's figure from a single fetch —
 * matching how it already loads campaign membership.
 *
 * Any member can read it: this is the answer to "is this property working",
 * which is the whole team's question, not an admin's.
 */

/**
 * A workspace with more inquiries than this reports the most recent ones.
 * Firestore has no server-side group-by, so the alternative is a per-listing
 * aggregation query — dozens of round trips on a page load, to refine a
 * number that is already in the right order of magnitude. The response says
 * when it has been capped rather than presenting a partial count as total.
 */
const SCAN_LIMIT = 2000;

export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const access = await requireSubAccountMember(request, id);
  if (access instanceof NextResponse) return access;

  try {
    const snap = await getAdminDb()
      .collection("listingInquiries")
      .where("subAccountId", "==", id)
      .limit(SCAN_LIMIT)
      .get();

    const stats = summariseListingInquiries(
      snap.docs.map((d) => {
        const data = d.data();
        return { listingId: data.listingId, createdAt: data.createdAt };
      })
    );

    return NextResponse.json({
      ok: true,
      stats,
      // True when the scan hit its ceiling, so a caller showing these numbers
      // can say they are a floor rather than a total. Silence here would turn
      // a capped count into a claimed one.
      capped: snap.size >= SCAN_LIMIT,
    });
  } catch (err) {
    console.error("[listings/inquiry-stats] query failed", id, err);
    // No stats rather than zeroes. A screen that renders "0 leads" because a
    // query failed tells an agent their marketing produced nothing, which is
    // the opposite of what happened.
    return NextResponse.json(
      { error: "Could not load inquiry counts." },
      { status: 500 }
    );
  }
}
