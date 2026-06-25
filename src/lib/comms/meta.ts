import "server-only";

import crypto from "node:crypto";

/**
 * Meta (Facebook Messenger + Instagram DM) integration wrapper — the BETA
 * unified-inbox channels. Everything here is INERT unless the deployment has a
 * Meta app configured (`META_APP_ID` + `META_APP_SECRET`) AND the sub-account's
 * agency gate (`metaInboxEnabledByAgency`) is on. Mirrors the shape of
 * `lib/comms/twilio.ts`: pure helpers + Graph API calls, no Firestore writes.
 *
 * Graph API version is pinned so a Meta-side default bump can't silently change
 * behaviour. Token exchange / page subscription only run during the OAuth
 * connect flow; the inbound webhook only needs signature verification.
 */

const GRAPH_VERSION = "v21.0";
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;

/**
 * OAuth scopes requested when an admin connects a Page. `pages_messaging` +
 * `instagram_manage_messages` are App-Review-gated by Meta — until the app
 * passes review these are only grantable to the app's own admins/testers, which
 * is exactly the beta-tester model.
 */
/** Base + inbox (Messenger / IG DM) scopes — always requested. */
const BASE_SCOPES = [
  "pages_show_list",
  "pages_messaging",
  "pages_manage_metadata",
  "pages_read_engagement",
  "instagram_basic",
  "instagram_manage_messages",
  "business_management",
];

/** Extra scopes required to publish posts (Social Planner). */
const PUBLISH_SCOPES = ["pages_manage_posts", "instagram_content_publish"];

/**
 * Build the OAuth scope string for ONE shared Meta connection. Both the inbox
 * and the Social Planner ride a single Page token; this is the single place
 * that decides what to request, gated by which features the agency enabled:
 *   - always the inbox/base scopes,
 *   - plus the publish scopes when `publish` (the Social Planner gate) is on.
 * What's actually GRANTED is recorded as capabilities at connect time (see
 * `getGrantedScopes` + the callback), so a user declining a permission can't
 * leave the UI claiming a capability the token doesn't have.
 */
export function metaScopeList(opts: { publish: boolean }): string {
  return [...BASE_SCOPES, ...(opts.publish ? PUBLISH_SCOPES : [])].join(",");
}

/** Default inbox-only scope string (back-compat default for buildMetaOAuthUrl). */
const OAUTH_SCOPES = metaScopeList({ publish: false });

/** The webhook fields we subscribe each connected Page to. */
const SUBSCRIBED_FIELDS = "messages,messaging_postbacks,message_reactions";

/** True when the deployment has Meta app credentials. Gate every connect/send on this. */
export function metaAppConfigured(): boolean {
  return !!process.env.META_APP_ID && !!process.env.META_APP_SECRET;
}

/** The verify token Meta echoes during the webhook GET handshake. */
export function metaWebhookVerifyToken(): string | null {
  return process.env.META_WEBHOOK_VERIFY_TOKEN || null;
}

/**
 * Build the Facebook Login dialog URL the admin is redirected to. Defaults to
 * the inbox scope set; the connect route passes an explicit
 * `scope: metaScopeList({ publish })` so publish permissions are requested
 * only when the Social Planner gate is on.
 */
export function buildMetaOAuthUrl(opts: {
  redirectUri: string;
  state: string;
  scope?: string;
}): string {
  const params = new URLSearchParams({
    client_id: process.env.META_APP_ID ?? "",
    redirect_uri: opts.redirectUri,
    state: opts.state,
    scope: opts.scope ?? OAUTH_SCOPES,
    response_type: "code",
  });
  return `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth?${params.toString()}`;
}

// ---------------------------------------------------------------------------
// CSRF state — HMAC-signed with the existing AUTOMATIONS_TOKEN_SECRET so the
// callback can trust `state` came from our connect route (and names the right
// sub-account) without persisting anything.
// ---------------------------------------------------------------------------

function stateSecret(): string {
  return process.env.AUTOMATIONS_TOKEN_SECRET ?? "";
}

export function signMetaState(subAccountId: string, nonce: string): string {
  const payload = `${subAccountId}.${nonce}`;
  const sig = crypto
    .createHmac("sha256", stateSecret())
    .update(`metastate:${payload}`)
    .digest("hex");
  return `${payload}.${sig}`;
}

export function verifyMetaState(
  state: string,
): { subAccountId: string } | null {
  const parts = state.split(".");
  if (parts.length !== 3) return null;
  const [subAccountId, nonce, sig] = parts;
  const expected = crypto
    .createHmac("sha256", stateSecret())
    .update(`metastate:${subAccountId}.${nonce}`)
    .digest("hex");
  if (sig.length !== expected.length) return null;
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
      return null;
    }
  } catch {
    return null;
  }
  return { subAccountId };
}

/**
 * Verify the `X-Hub-Signature-256` header Meta sends on every webhook POST.
 * HMAC-SHA256 of the RAW body keyed by the app secret, formatted `sha256=…`.
 * Returns false (reject) when no app secret is configured.
 */
export function verifyMetaSignature(
  rawBody: string,
  header: string | null,
): boolean {
  const secret = process.env.META_APP_SECRET ?? "";
  if (!header || !secret) return false;
  const expected =
    "sha256=" +
    crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  if (header.length !== expected.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(header), Buffer.from(expected));
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Graph API calls (connect flow + inbound enrichment)
// ---------------------------------------------------------------------------

interface TokenResponse {
  access_token?: string;
}

/** Exchange the OAuth `code` for a user access token. */
export async function exchangeCodeForUserToken(
  code: string,
  redirectUri: string,
): Promise<string> {
  const params = new URLSearchParams({
    client_id: process.env.META_APP_ID ?? "",
    client_secret: process.env.META_APP_SECRET ?? "",
    redirect_uri: redirectUri,
    code,
  });
  const res = await fetch(`${GRAPH}/oauth/access_token?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`Meta token exchange failed (${res.status})`);
  }
  const data = (await res.json()) as TokenResponse;
  if (!data.access_token) throw new Error("Meta token exchange: no token");
  return data.access_token;
}

export interface MetaPage {
  id: string;
  name: string;
  accessToken: string;
  instagramBusinessAccountId: string | null;
  instagramUsername: string | null;
}

interface PagesResponse {
  data?: Array<{
    id: string;
    name?: string;
    access_token?: string;
    instagram_business_account?: { id?: string; username?: string };
  }>;
}

/** List the Pages the connecting user manages, with any linked IG account. */
export async function listMetaPages(userToken: string): Promise<MetaPage[]> {
  const fields =
    "id,name,access_token,instagram_business_account{id,username}";
  const res = await fetch(
    `${GRAPH}/me/accounts?fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(userToken)}`,
  );
  if (!res.ok) {
    throw new Error(`Meta pages fetch failed (${res.status})`);
  }
  const data = (await res.json()) as PagesResponse;
  return (data.data ?? []).map((p) => ({
    id: p.id,
    name: p.name ?? "Facebook Page",
    accessToken: p.access_token ?? "",
    instagramBusinessAccountId: p.instagram_business_account?.id ?? null,
    instagramUsername: p.instagram_business_account?.username ?? null,
  }));
}

interface PermissionsResponse {
  data?: Array<{ permission?: string; status?: string }>;
}

/**
 * Fetch the permissions the user actually GRANTED (vs declined) for our app,
 * using the user token from the OAuth exchange. Returns the set of granted
 * permission strings. Best-effort — returns an empty set on failure so the
 * caller falls back to a conservative (no-capability) read.
 */
export async function getGrantedScopes(userToken: string): Promise<Set<string>> {
  try {
    const res = await fetch(
      `${GRAPH}/me/permissions?access_token=${encodeURIComponent(userToken)}`,
    );
    if (!res.ok) return new Set();
    const data = (await res.json()) as PermissionsResponse;
    const granted = new Set<string>();
    for (const row of data.data ?? []) {
      if (row.permission && row.status === "granted") granted.add(row.permission);
    }
    return granted;
  } catch {
    return new Set();
  }
}

/** Subscribe a Page to our app's webhook so we receive its message events. */
export async function subscribePageToWebhook(
  pageId: string,
  pageAccessToken: string,
): Promise<void> {
  const params = new URLSearchParams({
    subscribed_fields: SUBSCRIBED_FIELDS,
    access_token: pageAccessToken,
  });
  const res = await fetch(
    `${GRAPH}/${pageId}/subscribed_apps?${params.toString()}`,
    { method: "POST" },
  );
  if (!res.ok) {
    throw new Error(`Meta page subscribe failed (${res.status})`);
  }
}

/** Best-effort unsubscribe when a sub-account disconnects. */
export async function unsubscribePageFromWebhook(
  pageId: string,
  pageAccessToken: string,
): Promise<void> {
  const params = new URLSearchParams({ access_token: pageAccessToken });
  const res = await fetch(
    `${GRAPH}/${pageId}/subscribed_apps?${params.toString()}`,
    { method: "DELETE" },
  );
  if (!res.ok) {
    throw new Error(`Meta page unsubscribe failed (${res.status})`);
  }
}

interface SendResponse {
  message_id?: string;
  error?: { message?: string; code?: number };
}

/**
 * Send an outbound text message on Messenger or Instagram.
 *
 * Both go through the same Graph `…/messages` endpoint authed with the Page
 * token; only the sending node differs — the Page id for Messenger, the linked
 * IG business-account id for Instagram. `messaging_type: "RESPONSE"` marks this
 * as a reply within the user's messaging window (the standard, tag-free case).
 * Returns the Meta message id. Throws with Meta's error text on failure.
 */
export async function sendMetaMessage(opts: {
  channel: "messenger" | "instagram";
  fromNodeId: string;
  recipientId: string;
  text: string;
  pageAccessToken: string;
}): Promise<string> {
  const res = await fetch(
    `${GRAPH}/${opts.fromNodeId}/messages?access_token=${encodeURIComponent(opts.pageAccessToken)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_type: "RESPONSE",
        recipient: { id: opts.recipientId },
        message: { text: opts.text },
      }),
    },
  );
  const data = (await res.json().catch(() => ({}))) as SendResponse;
  if (!res.ok || data.error || !data.message_id) {
    throw new Error(
      data.error?.message ?? `Meta send failed (${res.status})`,
    );
  }
  return data.message_id;
}

interface ProfileResponse {
  name?: string;
  username?: string;
}

/**
 * Look up a messaging user's display name by their page-scoped id, using the
 * Page token. Best-effort — returns null on any failure so inbound handling
 * never blocks on it.
 */
export async function getMetaUserName(
  userId: string,
  pageAccessToken: string,
): Promise<string | null> {
  try {
    const res = await fetch(
      `${GRAPH}/${userId}?fields=name,username&access_token=${encodeURIComponent(pageAccessToken)}`,
    );
    if (!res.ok) return null;
    const data = (await res.json()) as ProfileResponse;
    return data.name || data.username || null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Social Planner — content publishing (Facebook Page + Instagram Business)
// ---------------------------------------------------------------------------

interface PublishResponse {
  id?: string;
  post_id?: string;
  error?: { message?: string; code?: number };
}

/**
 * Publish a post to a Facebook Page feed using the Page access token.
 *
 * With an image we POST to `…/photos` (the image is fetched by Meta from the
 * public `url`, with the caption); text-only posts go to `…/feed`. Returns the
 * created object id. Throws with Meta's error text on failure. Requires the
 * `pages_manage_posts` scope on the Page token.
 */
export async function publishToFacebookPage(opts: {
  pageId: string;
  pageAccessToken: string;
  message: string;
  imageUrl?: string | null;
}): Promise<{ id: string }> {
  const useImage = !!opts.imageUrl;
  const endpoint = useImage
    ? `${GRAPH}/${opts.pageId}/photos`
    : `${GRAPH}/${opts.pageId}/feed`;
  const body = new URLSearchParams({ access_token: opts.pageAccessToken });
  if (useImage) {
    body.set("url", opts.imageUrl as string);
    if (opts.message) body.set("caption", opts.message);
  } else {
    body.set("message", opts.message);
  }
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const data = (await res.json().catch(() => ({}))) as PublishResponse;
  const id = data.post_id ?? data.id;
  if (!res.ok || data.error || !id) {
    throw new Error(
      data.error?.message ?? `Facebook publish failed (${res.status})`,
    );
  }
  return { id };
}

/**
 * Publish a single-image post to an Instagram Business account. Two-step
 * container flow per the IG Content Publishing API:
 *   1. create a media container from the public `imageUrl` + caption,
 *   2. publish the container.
 *
 * IG has no binary-upload path — the image MUST be a public https URL (this is
 * why v1 takes a pasted URL). Uses the Page access token (IG publishing is
 * authed via the linked Page). Requires `instagram_content_publish`. Returns
 * the published media id. Throws with Meta's error text on failure.
 */
export async function publishToInstagram(opts: {
  igUserId: string;
  pageAccessToken: string;
  caption: string;
  imageUrl: string;
}): Promise<{ id: string }> {
  // Step 1 — create the media container.
  const createBody = new URLSearchParams({
    image_url: opts.imageUrl,
    access_token: opts.pageAccessToken,
  });
  if (opts.caption) createBody.set("caption", opts.caption);
  const createRes = await fetch(`${GRAPH}/${opts.igUserId}/media`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: createBody.toString(),
  });
  const createData = (await createRes.json().catch(() => ({}))) as PublishResponse;
  if (!createRes.ok || createData.error || !createData.id) {
    throw new Error(
      createData.error?.message ??
        `Instagram container create failed (${createRes.status})`,
    );
  }

  // Step 2 — publish the container.
  const publishBody = new URLSearchParams({
    creation_id: createData.id,
    access_token: opts.pageAccessToken,
  });
  const publishRes = await fetch(`${GRAPH}/${opts.igUserId}/media_publish`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: publishBody.toString(),
  });
  const publishData = (await publishRes.json().catch(() => ({}))) as PublishResponse;
  if (!publishRes.ok || publishData.error || !publishData.id) {
    throw new Error(
      publishData.error?.message ??
        `Instagram publish failed (${publishRes.status})`,
    );
  }
  return { id: publishData.id };
}
