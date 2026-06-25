import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import {
  exchangeCodeForUserToken,
  getGrantedScopes,
  listMetaPages,
  metaAppConfigured,
  subscribePageToWebhook,
  verifyMetaState,
} from "@/lib/comms/meta";
import { deriveMetaCapabilities } from "@/lib/comms/meta-capabilities";
import type { SubAccountDoc } from "@/types";

/**
 * OAuth callback for the BETA Facebook/Instagram connect flow.
 *
 *   GET /api/sub-accounts/[id]/meta/callback?code=…&state=…
 *
 * The admin's browser lands here after Facebook Login (so it carries the
 * session cookie — admin-gated, not public). Verifies the HMAC `state`,
 * re-checks the agency gate, exchanges the code for a Page token, subscribes
 * the Page to our webhook, and stores `metaConfig` on the sub-account. Always
 * redirects back to Settings with a `?meta=…` status. Never throws to the user.
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
  const finish = (status: string) => {
    settingsUrl.searchParams.set("meta", status);
    return NextResponse.redirect(settingsUrl);
  };

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  // User declined the Facebook dialog, or it errored.
  if (url.searchParams.get("error") || !code || !state) {
    return finish("cancelled");
  }

  const verified = verifyMetaState(state);
  if (!verified || verified.subAccountId !== id) {
    return finish("bad_state");
  }

  if (!metaAppConfigured()) {
    return finish("not_configured");
  }

  const db = getAdminDb();
  const snap = await db.doc(`subAccounts/${id}`).get();
  const sa = snap.exists ? (snap.data() as SubAccountDoc) : null;
  const inboxOn = sa?.metaInboxEnabledByAgency === true;
  const socialOn = sa?.socialPlannerEnabledByAgency === true;
  if (!inboxOn && !socialOn) {
    return finish("gate_off");
  }

  try {
    const redirectUri = `${appBase(request)}/api/sub-accounts/${id}/meta/callback`;
    const userToken = await exchangeCodeForUserToken(code, redirectUri);
    // Record what Meta actually granted (vs declined), intersected with the
    // gates that are on — the single source of truth both features read.
    const granted = await getGrantedScopes(userToken);
    const capabilities = deriveMetaCapabilities(granted, {
      inbox: inboxOn,
      publish: socialOn,
    });
    const pages = await listMetaPages(userToken);
    if (pages.length === 0) {
      return finish("no_pages");
    }

    // v1: connect the first managed Page. Multi-page selection is deferred —
    // a tester with several Pages would pick here in a later slice.
    const page = pages[0];

    // Best-effort — a failed subscribe shouldn't block storing the connection;
    // the operator can retry, and we surface a partial state if needed.
    let subscribed = true;
    try {
      await subscribePageToWebhook(page.id, page.accessToken);
    } catch (err) {
      subscribed = false;
      console.warn(
        `[meta/callback] page subscribe failed sa=${id} page=${page.id}`,
        err,
      );
    }

    await db.doc(`subAccounts/${id}`).update({
      metaConfig: {
        connected: true,
        pageId: page.id,
        pageName: page.name,
        pageAccessToken: page.accessToken,
        instagramBusinessAccountId: page.instagramBusinessAccountId,
        instagramUsername: page.instagramUsername,
        capabilities,
        connectedByUid: access.uid,
        connectedAt: FieldValue.serverTimestamp(),
      },
      updatedAt: FieldValue.serverTimestamp(),
    });

    return finish(subscribed ? "connected" : "connected_no_sub");
  } catch (err) {
    console.error(`[meta/callback] connect failed sa=${id}`, err);
    return finish("error");
  }
}
