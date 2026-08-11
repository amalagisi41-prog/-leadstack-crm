import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import {
  exchangeGhlCode,
  ghlOAuthConfigured,
  verifyGhlState,
} from "@/lib/import/ghl/oauth";
import { validateGhlAccess } from "@/lib/import/ghl/client";

function appBase(request: Request) {
  return (process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin).replace(/\/$/, "");
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const verified = state ? verifyGhlState(state) : null;
  if (!verified) return NextResponse.redirect(new URL("/dashboard?ghl=bad_state", appBase(request)));
  const id = verified.subAccountId;
  const finish = (status: string) =>
    NextResponse.redirect(new URL(`/sa/${id}/get-started?ghl=${status}`, appBase(request)));
  const access = await requireSubAccountAdmin(request, id);
  if (access instanceof NextResponse) return access;
  if (verified.uid !== access.uid) return finish("bad_state");
  if (!code || url.searchParams.get("error")) return finish("cancelled");
  if (!ghlOAuthConfigured()) return finish("not_configured");
  try {
    const redirectUri = `${appBase(request)}/api/integrations/ghl/callback`;
    const token = await exchangeGhlCode(code, redirectUri);
    await validateGhlAccess(token.accessToken, token.locationId!);
    await getAdminDb().doc(`subAccounts/${id}`).update({
      ghlImportConfig: {
        token: token.accessToken,
        refreshToken: token.refreshToken,
        locationId: token.locationId,
        companyId: token.companyId ?? null,
        scope: token.scope ?? "",
        oauthUserId: token.userId ?? null,
        authMethod: "oauth",
        tokenExpiresAt: new Date(Date.now() + token.expiresIn * 1000),
        connectedByUid: access.uid,
        connectedAt: FieldValue.serverTimestamp(),
        lastValidatedAt: FieldValue.serverTimestamp(),
      },
      updatedAt: FieldValue.serverTimestamp(),
    });
    return finish("connected");
  } catch (error) {
    console.error(`[ghl/oauth] connection failed sa=${id}`, error);
    return finish("error");
  }
}
