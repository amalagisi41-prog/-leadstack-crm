import "server-only";

import crypto from "node:crypto";

const AUTHORIZE_URL = "https://marketplace.gohighlevel.com/oauth/chooselocation";
const TOKEN_URL = "https://services.leadconnectorhq.com/oauth/token";

function secret() {
  return process.env.AUTOMATIONS_TOKEN_SECRET ?? process.env.COOKIE_SECRET_CURRENT ?? "";
}

export function ghlOAuthConfigured() {
  return Boolean(process.env.GHL_CLIENT_ID && process.env.GHL_CLIENT_SECRET && secret());
}

export function signGhlState(subAccountId: string, uid: string, nonce: string) {
  const payload = `${subAccountId}.${uid}.${nonce}`;
  const signature = crypto
    .createHmac("sha256", secret())
    .update(`ghl-oauth:${payload}`)
    .digest("hex");
  return Buffer.from(`${payload}.${signature}`).toString("base64url");
}

export function verifyGhlState(state: string) {
  try {
    const decoded = Buffer.from(state, "base64url").toString("utf8");
    const parts = decoded.split(".");
    if (parts.length !== 4) return null;
    const [subAccountId, uid, nonce, signature] = parts;
    const expected = crypto
      .createHmac("sha256", secret())
      .update(`ghl-oauth:${subAccountId}.${uid}.${nonce}`)
      .digest("hex");
    if (
      signature.length !== expected.length ||
      !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
    ) return null;
    return { subAccountId, uid };
  } catch {
    return null;
  }
}

export function buildGhlAuthorizeUrl(redirectUri: string, state: string) {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: process.env.GHL_CLIENT_ID ?? "",
    redirect_uri: redirectUri,
    scope:
      process.env.GHL_OAUTH_SCOPES ??
      "contacts.readonly opportunities.readonly locations.readonly",
    state,
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

interface GhlOAuthToken {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  locationId?: string;
  companyId?: string;
  scope?: string;
  userId?: string;
}

export async function exchangeGhlCode(code: string, redirectUri: string) {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Version: "v3",
    },
    body: JSON.stringify({
      clientId: process.env.GHL_CLIENT_ID,
      clientSecret: process.env.GHL_CLIENT_SECRET,
      grantType: "authorization_code",
      code,
      userType: "Location",
      redirectUri,
    }),
  });
  if (!response.ok) throw new Error(`HighLevel token exchange failed (${response.status})`);
  const raw = (await response.json()) as Record<string, unknown>;
  const token: GhlOAuthToken = {
    accessToken: String(raw.accessToken ?? raw.access_token ?? ""),
    refreshToken: String(raw.refreshToken ?? raw.refresh_token ?? ""),
    expiresIn: Number(raw.expiresIn ?? raw.expires_in ?? 86400),
    locationId: String(raw.locationId ?? raw.location_id ?? "") || undefined,
    companyId: String(raw.companyId ?? raw.company_id ?? "") || undefined,
    scope: String(raw.scope ?? "") || undefined,
    userId: String(raw.userId ?? raw.user_id ?? "") || undefined,
  };
  if (!token.accessToken || !token.refreshToken || !token.locationId) {
    throw new Error("HighLevel did not return a location connection.");
  }
  return token;
}
