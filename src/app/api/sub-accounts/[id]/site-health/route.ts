import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { getAdminDb } from "@/lib/firebase/admin";
import { computeSiteHealth } from "@/lib/site-health/tasks";
import {
  PLATFORM_SIGNATURES,
  isConfirmedOffPlatform,
} from "@/lib/site-health/platform-detection";
import type { MigrationAcks } from "@/lib/site-health/migration-independence";
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
    importJobsSnap,
    workflowsSnap,
  ] = await Promise.all([
    db.doc(`subAccounts/${id}`).get(),
    db.doc(`subAccounts/${id}/businessProfile/main`).get(),
    db.collection(`subAccounts/${id}/website`).limit(10).get(),
    db.doc(`subAccounts/${id}/agentSites/main`).get(),
    db.collection("forms").where("subAccountId", "==", id).limit(1).get(),
    db.collection(`subAccounts/${id}/bookingPages`).limit(1).get(),
    db.doc(`subAccounts/${id}/aiAgent/web-chat`).get(),
    db
      .collection(`subAccounts/${id}/importJobs`)
      .where("status", "==", "completed")
      .limit(5)
      .get(),
    db.collection(`subAccounts/${id}/workflows`).limit(1).get(),
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

  const verification = sub.externalSiteVerification as
    | SiteVerificationRecord
    | undefined;
  const siteVerifiedLive = isVerificationCurrent(
    verification,
    typeof sub.customDomain === "string" ? sub.customDomain : undefined
  );

  // Only an account that came from somewhere else gets the cancellation
  // checks; a fresh signup has no old subscription to wind down.
  const foundation = (sub.onboardingFoundation ?? {}) as {
    sourcePlatform?: string | null;
  };
  const migratedFrom = foundation.sourcePlatform ?? null;
  const migratedFromLabel =
    PLATFORM_SIGNATURES.find((p) => p.id === migratedFrom)?.label ??
    (migratedFrom ? migratedFrom : null);
  const contactsImported = importJobsSnap.docs.some(
    (doc) => (doc.data()?.totals?.contacts?.created ?? 0) > 0
  );

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
    externalSiteVerified: siteVerifiedLive,
    independence: migratedFrom
      ? {
          migratedFrom,
          migratedFromLabel,
          siteVerifiedLive,
          siteConfirmedOffPlatform: isConfirmedOffPlatform(
            verification?.servedByPlatform !== undefined
              ? {
                  platform: verification.servedByPlatform ?? null,
                  label: verification.servedByLabel ?? null,
                  confidence: verification.servedByPlatform
                    ? "confirmed"
                    : "unknown",
                  evidence: verification.evidence ?? [],
                }
              : null,
            migratedFrom
          ),
          siteServedByLabel: verification?.servedByLabel ?? null,
          ownsPhoneNumber: Boolean(
            sub.twilioConfig?.accountSid && sub.twilioConfig?.phoneNumber
          ),
          ownsEmailDomain: sub.resendConfig?.status === "verified",
          contactsImported,
          automationsRebuilt: !workflowsSnap.empty,
          acks: (sub.migrationAcks ?? {}) as MigrationAcks,
        }
      : undefined,
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
