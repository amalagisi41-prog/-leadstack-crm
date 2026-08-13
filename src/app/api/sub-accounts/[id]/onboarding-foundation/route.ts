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
  "bluehost",
  "godaddy",
  "wix",
  "squarespace",
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
  const snap = await getAdminDb().doc(`subAccounts/${id}`).get();
  return NextResponse.json({
    foundation: {
      ...EMPTY_ONBOARDING_FOUNDATION,
      ...(snap.data()?.onboardingFoundation ?? {}),
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

  const foundation = {
    completed: true,
    mode,
    sourcePlatform,
    sourceUrl,
    domainStartingPoint,
    hostingStartingPoint,
    profileImported: body.profileImported === true,
    updatedAt: FieldValue.serverTimestamp(),
  };
  await getAdminDb()
    .doc(`subAccounts/${id}`)
    .set(
      {
        onboardingFoundation: foundation,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  return NextResponse.json({ ok: true, foundation });
}
