/**
 * The ONE redirect URI for the Google Business Profile import flow.
 *
 * Google requires the `redirect_uri` sent during the token exchange to match
 * the one used to build the authorization URL, exactly. This constant exists
 * because those two were previously hardcoded separately and had drifted:
 *
 *   authorization  → ${APP_URL}/api/oauth/google/callback
 *   token exchange → ${APP_URL}/api/sub-accounts/${id}/business-profile/import-google
 *
 * Every exchange therefore failed with `redirect_uri_mismatch`. The second form
 * was also per-sub-account dynamic, so it could never have been registered in
 * the Google Cloud console in the first place.
 *
 * Register exactly this path as an Authorized redirect URI on the OAuth client.
 */
export const GOOGLE_BUSINESS_REDIRECT_PATH = "/api/oauth/google/callback";

export function googleBusinessRedirectUri(): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "") ?? "";
  return `${appUrl}${GOOGLE_BUSINESS_REDIRECT_PATH}`;
}
