import "server-only";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import type {
  CampaignApprovalAuditDoc,
  CampaignBriefDoc,
} from "@/types/marketing-campaigns";
import type { IdxListingDoc } from "@/types/idx";
import type { PropertyMediaPackageDoc } from "@/types/property-media";

function isoTimestamp(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const timestamp = value as { toDate?: () => Date };
  const date = timestamp.toDate?.();
  return date instanceof Date ? date.toISOString() : null;
}

/**
 * The property workspace is a read model over the property-owned records.
 * It deliberately reports missing listing/media/audit records as missing;
 * callers must not infer that a listing was synced, a brochure exists, or an
 * approval happened from the absence of an error.
 */
export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string; listingId: string }> }
) {
  const { id, listingId } = await ctx.params;
  const access = await requireSubAccountMember(request, id);
  if (access instanceof NextResponse) return access;

  const db = getAdminDb();
  const briefRef = db.doc(`subAccounts/${id}/campaignBriefs/${listingId}`);
  const [briefSnap, listingSnap, packageSnap, auditSnap] = await Promise.all([
    briefRef.get(),
    db.doc(`subAccounts/${id}/idxListings/${listingId}`).get(),
    db.doc(`subAccounts/${id}/mediaPackages/${listingId}`).get(),
    briefRef
      .collection("approvalAudit")
      .orderBy("approvedAt", "desc")
      .limit(25)
      .get(),
  ]);

  if (!briefSnap.exists) {
    return NextResponse.json(
      {
        error:
          "This property workspace no longer exists. Return to Properties to choose another listing.",
      },
      { status: 404 }
    );
  }

  const brief = briefSnap.data() as Omit<CampaignBriefDoc, "id">;
  const listing = listingSnap.exists
    ? ({ id: listingSnap.id, ...listingSnap.data() } as IdxListingDoc)
    : null;
  const mediaPackage = packageSnap.exists
    ? (packageSnap.data() as PropertyMediaPackageDoc)
    : null;
  const approvals = auditSnap.docs.map((doc) => {
    const audit = doc.data() as CampaignApprovalAuditDoc;
    return {
      id: doc.id,
      channels: audit.channels,
      approvedAt: isoTimestamp(audit.approvedAt),
      approvedByUid: audit.approvedByUid,
      decision: audit.decision === "declined" ? "declined" : "approved",
      reason: typeof audit.reason === "string" ? audit.reason : undefined,
    };
  });

  return NextResponse.json({
    ok: true,
    brief: {
      id: briefSnap.id,
      ...brief,
      createdAt: isoTimestamp(brief.createdAt),
      updatedAt: isoTimestamp(brief.updatedAt),
    },
    listing: listing
      ? { ...listing, syncedAt: isoTimestamp(listing.syncedAt) }
      : null,
    mediaPackage: mediaPackage
      ? {
          brochureUrl: mediaPackage.brochureUrl,
          photoCount: mediaPackage.photoCount,
          sourceName: mediaPackage.sourceName,
          updatedAt: isoTimestamp(mediaPackage.updatedAt),
        }
      : null,
    approvals,
  });
}
