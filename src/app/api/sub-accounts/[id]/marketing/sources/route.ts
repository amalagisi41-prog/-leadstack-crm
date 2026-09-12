import "server-only";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountAdmin, requireSubAccountMember } from "@/lib/auth/require-tenancy";

function validUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" ? url.toString() : null;
  } catch { return null; }
}

const PORTAL_KEYS = ["zillow", "homes", "realtor"] as const;
type PortalKey = (typeof PORTAL_KEYS)[number];
type PortalProfiles = Record<PortalKey, string | null>;

function portalProfiles(value: unknown): PortalProfiles {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return Object.fromEntries(PORTAL_KEYS.map((key) => [key, validUrl(source[key])])) as PortalProfiles;
}

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const access = await requireSubAccountMember(request, id);
  if (access instanceof NextResponse) return access;
  const snap = await getAdminDb().doc(`subAccounts/${id}`).get();
  const data = snap.data() as { marketingSources?: { zillow?: Record<string, string | null>; portalProfiles?: Record<string, string | null> } } | undefined;
  const zillow = data?.marketingSources?.zillow ?? { profileUrl: null, listingUrl: null };
  const savedProfiles = portalProfiles(data?.marketingSources?.portalProfiles);
  // Preserve the existing Zillow reference when a workspace is upgraded.
  if (!savedProfiles.zillow) savedProfiles.zillow = validUrl(zillow.profileUrl);
  return NextResponse.json({ ok: true, zillow, portalProfiles: savedProfiles });
}

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const access = await requireSubAccountAdmin(request, id);
  if (access instanceof NextResponse) return access;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const profileUrl = validUrl(body?.profileUrl);
  const listingUrl = validUrl(body?.listingUrl);
  const profiles = portalProfiles(body?.portalProfiles);
  if ((body?.profileUrl && !profileUrl) || (body?.listingUrl && !listingUrl)) {
    return NextResponse.json({ error: "Zillow links must be valid https URLs." }, { status: 400 });
  }
  if (body?.portalProfiles && typeof body.portalProfiles === "object") {
    for (const key of PORTAL_KEYS) {
      const supplied = (body.portalProfiles as Record<string, unknown>)[key];
      if (supplied && !profiles[key]) {
        return NextResponse.json({ error: "Profile links must be valid https URLs." }, { status: 400 });
      }
    }
  }
  const sourceRef = getAdminDb().doc(`subAccounts/${id}`);
  const existing = await sourceRef.get();
  const existingSources = existing.data()?.marketingSources as { zillow?: Record<string, string | null>; portalProfiles?: Record<string, string | null> } | undefined;
  const existingProfiles = portalProfiles(existingSources?.portalProfiles);
  const nextProfiles = body?.portalProfiles && typeof body.portalProfiles === "object"
    ? profiles
    : existingProfiles;
  if (profileUrl) nextProfiles.zillow = profileUrl;
  const nextZillow = {
    profileUrl: body?.profileUrl === undefined ? existingSources?.zillow?.profileUrl ?? null : profileUrl,
    listingUrl: body?.listingUrl === undefined ? existingSources?.zillow?.listingUrl ?? null : listingUrl,
  };
  await sourceRef.set({ marketingSources: { zillow: nextZillow, portalProfiles: nextProfiles } }, { merge: true });
  return NextResponse.json({ ok: true, zillow: nextZillow, portalProfiles: nextProfiles });
}
