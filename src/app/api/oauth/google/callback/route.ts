import "server-only";

import { NextRequest, NextResponse } from "next/server";

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

  // Extract sub-account ID from state (format: "subAccountId:randomState")
  const [subAccountId] = state.split(":");

  if (!subAccountId) {
    const redirectUrl = new URL("/", request.nextUrl.origin);
    redirectUrl.searchParams.set("oauth_error", "invalid_state");
    redirectUrl.searchParams.set("error_message", "Invalid state parameter - missing sub-account ID");
    return NextResponse.redirect(redirectUrl);
  }

  // Redirect back to the business profile page with the authorization code
  // The client component will detect this and exchange the code for tokens
  const redirectUrl = new URL(
    `/sa/${subAccountId}/business-profile`,
    request.nextUrl.origin
  );
  redirectUrl.searchParams.set("oauth_code", code);
  redirectUrl.searchParams.set("oauth_state", state);

  return NextResponse.redirect(redirectUrl);
}
