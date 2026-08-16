import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { getAdminDb } from "@/lib/firebase/admin";
import { computeSiteHealth } from "@/lib/site-health/tasks";
import {
  isVerificationCurrent,
  type SiteVerificationRecord,
} from "@/lib/site-health/liveness";
import type { BusinessProfileContent } from "@/types/business-profile";

export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const access = await requireSubAccountMember(request, id);
  if (access instanceof NextResponse) return access;

  const db = getAdminDb();
  const [
    subSnap,
    profileSnap,
    websiteSnap,
    agentSiteSnap,
    formsSnap,
    bookingSnap,
    chatSnap,
  ] = await Promise.all([
    db.doc(`subAccounts/${id}`).get(),
    db.doc(`subAccounts/${id}/businessProfile/main`).get(),
    db.collection(`subAccounts/${id}/website`).limit(10).get(),
    db.doc(`subAccounts/${id}/agentSites/main`).get(),
    db.collection("forms").where("subAccountId", "==", id).limit(1).get(),
    db.collection(`subAccounts/${id}/bookingPages`).limit(1).get(),
    db.doc(`subAccounts/${id}/aiAgent/web-chat`).get(),
  ]);

  const sub = subSnap.data() ?? {};
  const profile = (profileSnap.data() ??
    {}) as Partial<BusinessProfileContent> & {
    completeness?: number;
  };
  const publishedWebsite = websiteSnap.docs.some((doc) => {
    const data = doc.data();
    return data.status === "ready" || Boolean(data.liveUrl);
  });
  const publishedAgentSite =
    agentSiteSnap.exists && agentSiteSnap.data()?.status === "published";

  // Scoring lives in lib/site-health/tasks so it can be exercised persona by
  // persona without a live Firestore read. This route only does the reads.
  const result = computeSiteHealth({
    profile,
    publishedWebsite,
    publishedAgentSite,
    customDomain:
      typeof sub.customDomain === "string" ? sub.customDomain : undefined,
    // An agent who keeps their own website clears the publish task on a
    // verified live site. Read-only here — the probe runs in verify-site.
    externalSiteVerified: isVerificationCurrent(
      sub.externalSiteVerification as SiteVerificationRecord | undefined,
      typeof sub.customDomain === "string" ? sub.customDomain : undefined
    ),
    hasLeadForm: !formsSnap.empty,
    hasBookingPage: !bookingSnap.empty,
    webChatEnabled: chatSnap.exists && chatSnap.data()?.enabled === true,
    businessEmailVerified: sub.resendConfig?.status === "verified",
  });

  return NextResponse.json({
    ...result,
    checkedAt: new Date().toISOString(),
  });
}
