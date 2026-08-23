import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { verifyGoogleOAuthState } from "@/lib/comms/google-oauth-state";

/**
 * OAuth callback handler for Google Business Profile import.
 *
 * This is a static route that receives the OAuth authorization code from Google
 * and stores it in the session, then redirects back to the sub-account's
 * business profile import page to complete the flow.
 *
 * Google redirect URI: https://your-domain.com/api/oauth/google/callback
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");

  // Handle OAuth errors
  if (error) {
    const message = errorDescription || error;
    const redirectUrl = new URL("/", request.nextUrl.origin);
    redirectUrl.searchParams.set("oauth_error", error);
    redirectUrl.searchParams.set("error_message", message);
    return NextResponse.redirect(redirectUrl);
  }

  // Missing required parameters
  if (!code || !state) {
    const redirectUrl = new URL("/", request.nextUrl.origin);
    redirectUrl.searchParams.set("oauth_error", "invalid_request");
    redirectUrl.searchParams.set("error_message", "Missing code or state parameter");
    return NextResponse.redirect(redirectUrl);
  }

  // Verify the HMAC signature before trusting anything inside `state`.
  //
  // This route is necessarily unauthenticated — Google redirects the browser
  // here — so the signature IS the authentication. Previously it simply split
  // the string on ":" and trusted the sub-account id it found, which let an
  // attacker craft `state=<victimSubAccountId>:anything`, complete a Google
  // consent with their OWN account, and have the browser carry their
  // authorization code to the victim's workspace, where the client component
  // fires the exchange automatically. That is OAuth code injection: the
  // attacker's Google Business Profile data lands in someone else's CRM.
  const verified = verifyGoogleOAuthState(state);

  if (!verified) {
    const redirectUrl = new URL("/", request.nextUrl.origin);
    redirectUrl.searchParams.set("oauth_error", "invalid_state");
    redirectUrl.searchParams.set(
      "error_message",
      "This Google connection link is no longer valid. Start the import again from your Business Blueprint."
    );
    return NextResponse.redirect(redirectUrl);
  }

  // Redirect back to the business profile page with the authorization code.
  // Both `code` AND `state` are forwarded: the exchange endpoint re-verifies
  // the state and checks it names the sub-account in the path.
  const redirectUrl = new URL(
    `/sa/${verified.subAccountId}/business-profile`,
    request.nextUrl.origin
  );
  redirectUrl.searchParams.set("oauth_code", code);
  redirectUrl.searchParams.set("oauth_state", state);

  return NextResponse.redirect(redirectUrl);
}
