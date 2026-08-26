import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { getAdminDb } from "@/lib/firebase/admin";
import {
  EMPTY_ONBOARDING_FOUNDATION,
  type BusinessSourcePlatform,
  type DomainStartingPoint,
  type HostingStartingPoint,
  type OnboardingFoundationMode,
} from "@/types/onboarding-foundation";

const MODES = new Set<OnboardingFoundationMode>([
  "transfer",
  "foundation",
  "fresh",
]);
const PLATFORMS = new Set<BusinessSourcePlatform>([
  "gohighlevel",
  "followupboss",
  "kvcore",
  "lofty",
  "chime",
  "wordpress",
  "wordpress_selfhosted",
  "hostinger",
  "bluehost",
  "godaddy",
  "wix",
  "squarespace",
  "siteground",
  "namecheap",
  "vercel",
  "nextjs",
  "make",
  "vibe",
  "zillow",
  "realtor",
  "homes",
  "other",
]);
const DOMAIN_POINTS = new Set<DomainStartingPoint>([
  "have_domain",
  "need_domain",
  "not_sure",
]);
const HOSTING_POINTS = new Set<HostingStartingPoint>([
  "agentstack_managed",
  "transfer_existing",
  "keep_existing",
]);

export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const access = await requireSubAccountAdmin(request, id);
  if (access instanceof NextResponse) return access;
  const db = getAdminDb();
  const [snap, transferSnap] = await Promise.all([
    db.doc(`subAccounts/${id}`).get(),
    db.doc(`subAccounts/${id}/websiteTransfers/current`).get(),
  ]);
  const saved = snap.data()?.onboardingFoundation ?? {};
  const customDomain =
    typeof snap.data()?.customDomain === "string"
      ? snap.data()!.customDomain
      : "";
  const transfer = transferSnap.data();
  const replacementFoundationReady =
    transfer?.hostingStatus === "ready" &&
    typeof transfer?.hostingUrl === "string" &&
    transfer.hostingUrl.startsWith("https://");
  return NextResponse.json({
    foundation: replacementFoundationReady
      ? {
          ...EMPTY_ONBOARDING_FOUNDATION,
          ...saved,
          completed: true,
          mode: "transfer",
          sourceUrl: transfer?.sourceUrl ?? saved.sourceUrl ?? "",
          domainStartingPoint: "have_domain",
          domainName: customDomain || saved.domainName || "",
          domainSetupConfirmed: true,
          hostingStartingPoint: "agentstack_managed",
          hostingSetupConfirmed: true,
        }
      : {
          ...EMPTY_ONBOARDING_FOUNDATION,
          ...saved,
        },
  });
}

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const access = await requireSubAccountAdmin(request, id);
  if (access instanceof NextResponse) return access;

  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (!body)
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });

  const mode =
    typeof body.mode === "string" &&
    MODES.has(body.mode as OnboardingFoundationMode)
      ? (body.mode as OnboardingFoundationMode)
      : null;
  if (!mode)
    return NextResponse.json(
      { error: "Choose how you want to start." },
      { status: 400 }
    );

  const sourcePlatform =
    typeof body.sourcePlatform === "string" &&
    PLATFORMS.has(body.sourcePlatform as BusinessSourcePlatform)
      ? (body.sourcePlatform as BusinessSourcePlatform)
      : null;
  const domainStartingPoint =
    typeof body.domainStartingPoint === "string" &&
    DOMAIN_POINTS.has(body.domainStartingPoint as DomainStartingPoint)
      ? (body.domainStartingPoint as DomainStartingPoint)
      : null;
  const sourceUrl =
    typeof body.sourceUrl === "string"
      ? body.sourceUrl.trim().slice(0, 500)
      : "";
  const hostingStartingPoint =
    typeof body.hostingStartingPoint === "string" &&
    HOSTING_POINTS.has(body.hostingStartingPoint as HostingStartingPoint)
      ? (body.hostingStartingPoint as HostingStartingPoint)
      : null;
  const domainName =
    typeof body.domainName === "string"
      ? body.domainName
          .trim()
          .replace(/^https?:\/\//i, "")
          .replace(/\/.*$/, "")
          .slice(0, 253)
      : "";

  const foundation = {
    completed: true,
    mode,
    sourcePlatform,
    sourceUrl,
    domainStartingPoint,
    hostingStartingPoint,
    domainName,
    domainSetupConfirmed: body.domainSetupConfirmed === true,
    hostingSetupConfirmed: body.hostingSetupConfirmed === true,
    profileImported: body.profileImported === true,
    updatedAt: FieldValue.serverTimestamp(),
  };
  await getAdminDb().doc(`subAccounts/${id}`).set(
    {
      onboardingFoundation: foundation,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
  return NextResponse.json({ ok: true, foundation });
}
