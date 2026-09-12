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

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const access = await requireSubAccountMember(request, id);
  if (access instanceof NextResponse) return access;
  const snap = await getAdminDb().doc(`subAccounts/${id}`).get();
  const data = snap.data() as { marketingSources?: { zillow?: Record<string, string | null> } } | undefined;
  return NextResponse.json({ ok: true, zillow: data?.marketingSources?.zillow ?? { profileUrl: null, listingUrl: null } });
}

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const access = await requireSubAccountAdmin(request, id);
  if (access instanceof NextResponse) return access;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const profileUrl = validUrl(body?.profileUrl);
  const listingUrl = validUrl(body?.listingUrl);
  if ((body?.profileUrl && !profileUrl) || (body?.listingUrl && !listingUrl)) {
    return NextResponse.json({ error: "Zillow links must be valid https URLs." }, { status: 400 });
  }
  await getAdminDb().doc(`subAccounts/${id}`).set({ marketingSources: { zillow: { profileUrl, listingUrl } } }, { merge: true });
  return NextResponse.json({ ok: true, zillow: { profileUrl, listingUrl } });
}
