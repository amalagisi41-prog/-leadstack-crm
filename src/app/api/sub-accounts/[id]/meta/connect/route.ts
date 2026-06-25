import "server-only";

import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import {
  buildMetaOAuthUrl,
  metaAppConfigured,
  metaScopeList,
  signMetaState,
} from "@/lib/comms/meta";
import type { SubAccountDoc } from "@/types";

/**
 * Kick off the Facebook/Instagram connect flow — ONE shared connection that
 * powers both the inbox and the Social Planner.
 *
 *   GET /api/sub-accounts/[id]/meta/connect
 *
 * Sub-account admin only. Allowed when EITHER the inbox gate
 * (`metaInboxEnabledByAgency`) OR the Social gate
 * (`socialPlannerEnabledByAgency`) is on, and the deployment has a Meta app
 * configured. The requested scopes include publishing only when the Social
 * gate is on. On success redirects to Facebook Login; any guard miss redirects
 * back to Settings with a `?meta=…` status. The callback completes the
 * handshake and records the granted capabilities.
 */

function appBase(request: Request): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin
  ).replace(/\/$/, "");
}

export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const access = await requireSubAccountAdmin(request, id);
  if (access instanceof NextResponse) return access;

  const settingsUrl = new URL(
    `/sa/${id}/dashboard/settings`,
    appBase(request),
  );

  const snap = await getAdminDb().doc(`subAccounts/${id}`).get();
  const sa = snap.exists ? (snap.data() as SubAccountDoc) : null;

  // Agency gate — allow when EITHER feature is unlocked. Publishing scopes are
  // only requested when the Social Planner gate is on.
  const inboxOn = sa?.metaInboxEnabledByAgency === true;
  const socialOn = sa?.socialPlannerEnabledByAgency === true;
  if (!inboxOn && !socialOn) {
    settingsUrl.searchParams.set("meta", "gate_off");
    return NextResponse.redirect(settingsUrl);
  }

  if (!metaAppConfigured()) {
    settingsUrl.searchParams.set("meta", "not_configured");
    return NextResponse.redirect(settingsUrl);
  }

  const nonce = crypto.randomBytes(16).toString("hex");
  const state = signMetaState(id, nonce);
  const redirectUri = `${appBase(request)}/api/sub-accounts/${id}/meta/callback`;
  return NextResponse.redirect(
    buildMetaOAuthUrl({
      redirectUri,
      state,
      scope: metaScopeList({ publish: socialOn }),
    }),
  );
}
