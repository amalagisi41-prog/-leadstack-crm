import "server-only";

import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import {
  buildGhlAuthorizeUrl,
  ghlOAuthConfigured,
  signGhlState,
} from "@/lib/import/ghl/oauth";

function appBase(request: Request) {
  return (process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin).replace(/\/$/, "");
}

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const access = await requireSubAccountAdmin(request, id);
  if (access instanceof NextResponse) return access;
  const fallback = new URL(`/sa/${id}/get-started`, appBase(request));
  if (!ghlOAuthConfigured()) {
    fallback.searchParams.set("ghl", "not_configured");
    return NextResponse.redirect(fallback);
  }
  const redirectUri = `${appBase(request)}/api/integrations/ghl/callback`;
  const state = signGhlState(id, access.uid, crypto.randomBytes(16).toString("hex"));
  return NextResponse.redirect(buildGhlAuthorizeUrl(redirectUri, state));
}
