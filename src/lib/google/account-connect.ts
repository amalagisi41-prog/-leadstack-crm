import "server-only";

import crypto from "node:crypto";
import { googleBusinessRedirectUri } from "@/lib/business-profile/google-redirect";

/**
 * One "Google Profile" connection for a sub-account.
 *
 * Before this, Google was three unrelated flows — Business Profile import
 * (buried inside Business Blueprint), Gmail send-as (Settings), and Google
 * Calendar (Settings, on a second OAuth client). The Connect screen's Google
 * card pointed at the Blueprint page and could never show "Connected".
 *
 * This flow asks for everything once, on the SAME OAuth client
 * (GOOGLE_OAUTH_CLIENT_ID) and the SAME already-registered redirect URI as the
 * Business Profile import. Calendar can enter this flow with a signed return
 * target so the Settings connection card returns to the right screen.
 */

export const GOOGLE_ACCOUNT_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/business.manage",
] as const;

export const GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";
export const CALENDAR_EVENTS_SCOPE =
  "https://www.googleapis.com/auth/calendar.events";
export const BUSINESS_MANAGE_SCOPE =
  "https://www.googleapis.com/auth/business.manage";

const STATE_PREFIX = "acct";
const HMAC_DOMAIN = "googleaccount:";

export type GoogleAccountReturnTo = "connect" | "calendar";

function stateSecret(): string {
  return process.env.AUTOMATIONS_TOKEN_SECRET ?? "";
}

function sign(payload: string): string {
  return crypto
    .createHmac("sha256", stateSecret())
    .update(`${HMAC_DOMAIN}${payload}`)
    .digest("hex");
}

export function signGoogleAccountState(
  subAccountId: string,
  nonce: string = crypto.randomBytes(16).toString("hex"),
  returnTo: GoogleAccountReturnTo = "connect",
): string {
  const payload = `${STATE_PREFIX}.${subAccountId}.${nonce}.${returnTo}`;
  return `${payload}.${sign(payload)}`;
}

export function verifyGoogleAccountState(
  state: string,
): { subAccountId: string; returnTo: GoogleAccountReturnTo } | null {
  const parts = state.split(".");
  if (parts.length !== 5 || parts[0] !== STATE_PREFIX) return null;
  const [, subAccountId, nonce, returnTo, sig] = parts;
  if (
    !subAccountId ||
    !nonce ||
    !sig ||
    (returnTo !== "connect" && returnTo !== "calendar")
  ) {
    return null;
  }
  const expected = sign(
    `${STATE_PREFIX}.${subAccountId}.${nonce}.${returnTo}`,
  );
  if (sig.length !== expected.length) return null;
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
      return null;
    }
  } catch {
    return null;
  }
  return { subAccountId, returnTo };
}

export function googleAccountClient(): {
  clientId: string;
  clientSecret: string;
} | null {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

export function buildGoogleAccountAuthUrl(
  subAccountId: string,
  clientId: string,
  returnTo: GoogleAccountReturnTo = "connect",
): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: googleBusinessRedirectUri(),
    response_type: "code",
    scope: GOOGLE_ACCOUNT_SCOPES.join(" "),
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "consent select_account",
    state: signGoogleAccountState(subAccountId, undefined, returnTo),
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export { googleAccountConnectPath } from "./account-connect-path";
