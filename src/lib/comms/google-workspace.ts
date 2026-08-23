import "server-only";

import { google } from "googleapis";
import type { GoogleWorkspaceConfig } from "@/types/tenancy";
import {
  loadGoogleWorkspaceSecrets,
  writeGoogleWorkspaceSecrets,
  type GoogleWorkspaceSecrets,
} from "./sub-account-secrets";

/**
 * Check if the access token is expired or about to expire (within 5 minutes).
 */
export function isAccessTokenExpired(expiresAt: number): boolean {
  const fiveMinutesFromNow = Date.now() + 5 * 60 * 1000;
  return expiresAt < fiveMinutesFromNow;
}

/**
 * Raised when a sub-account's Google connection can no longer be used and the
 * operator has to reconnect (refresh token missing, revoked, or rejected).
 * Callers surface `.message` directly — it is written for the operator, not
 * for a log line.
 */
export class GoogleWorkspaceReconnectRequired extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GoogleWorkspaceReconnectRequired";
  }
}

/**
 * Refresh the access token using the refresh token.
 * Updates the stored secrets and returns the new credentials.
 */
export async function refreshGoogleAccessToken(
  subAccountId: string,
  secrets: GoogleWorkspaceSecrets,
): Promise<{ accessToken: string; expiresAt: number }> {
  if (!secrets.refreshToken) {
    throw new GoogleWorkspaceReconnectRequired(
      "This Google account needs to be reconnected — no refresh token is stored. Open Settings → Email and reconnect.",
    );
  }

  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      "Google OAuth credentials not configured on this deployment",
    );
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: secrets.refreshToken,
    }).toString(),
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    // Google returns 400 invalid_grant when the refresh token has been
    // revoked (user removed access, password change, 6-month idle expiry).
    // That is unrecoverable without a reconnect — say so plainly rather than
    // letting the caller retry forever.
    if (response.status === 400 || response.status === 401) {
      throw new GoogleWorkspaceReconnectRequired(
        "Google has revoked this connection. Open Settings → Email and reconnect the account.",
      );
    }
    throw new Error(
      `Google token refresh failed: ${response.status} ${body.slice(0, 200)}`,
    );
  }

  const data = (await response.json()) as {
    access_token: string;
    expires_in: number;
  };

  const newExpiresAt = Date.now() + data.expires_in * 1000;

  await writeGoogleWorkspaceSecrets(subAccountId, {
    accessToken: data.access_token,
    refreshToken: secrets.refreshToken,
    expiresAt: newExpiresAt,
  });

  return { accessToken: data.access_token, expiresAt: newExpiresAt };
}

/**
 * Loads the sub-account's Google tokens and returns a currently-valid access
 * token, refreshing first when the stored one is expired or within 5 minutes
 * of expiring.
 *
 * Throws `GoogleWorkspaceReconnectRequired` when the connection is dead. A
 * previous version logged a warning here and then attempted the send with the
 * known-expired token anyway ("the Gmail API might still accept it") — it
 * will not, and doing so turned a clear, actionable error into a confusing
 * 401 at the send site.
 */
export async function resolveGoogleAccessToken(
  subAccountId: string,
): Promise<string> {
  const secrets = await loadGoogleWorkspaceSecrets(subAccountId);
  if (!secrets?.accessToken) {
    throw new GoogleWorkspaceReconnectRequired(
      "No Google credentials are stored for this sub-account. Open Settings → Email and connect an account.",
    );
  }

  if (!secrets.expiresAt || isAccessTokenExpired(secrets.expiresAt)) {
    const refreshed = await refreshGoogleAccessToken(subAccountId, secrets);
    return refreshed.accessToken;
  }

  return secrets.accessToken;
}

// ---------------------------------------------------------------------------
// RFC 2822 message assembly
// ---------------------------------------------------------------------------

/**
 * Strips CR and LF from a value destined for an email header.
 *
 * Headers are assembled by string concatenation below. Without this, a
 * newline in any interpolated value (a contact-supplied name, an
 * operator-typed subject) injects arbitrary additional headers — including
 * `Bcc:` — into the outgoing message.
 */
function sanitizeHeaderValue(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

/**
 * Encodes a header value as RFC 2047 base64 when it contains non-ASCII.
 * Without this, an accented sender name or an emoji in a subject line is
 * transmitted raw and renders as mojibake in most clients.
 */
function encodeHeaderValue(value: string): string {
  const clean = sanitizeHeaderValue(value);
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7F]*$/.test(clean)) return clean;
  return `=?UTF-8?B?${Buffer.from(clean, "utf8").toString("base64")}?=`;
}

/** Exported for unit tests — see google-workspace.test.ts. */
export function buildRfc2822Message({
  senderEmail,
  senderName,
  to,
  subject,
  text,
  html,
  replyTo,
}: {
  senderEmail: string;
  senderName: string;
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
}): string {
  const lines = [
    `From: ${encodeHeaderValue(senderName)} <${sanitizeHeaderValue(senderEmail)}>`,
    `To: ${sanitizeHeaderValue(to)}`,
    `Subject: ${encodeHeaderValue(subject)}`,
    `Content-Type: ${html ? "text/html" : "text/plain"}; charset="UTF-8"`,
    "MIME-Version: 1.0",
  ];

  if (replyTo) {
    lines.push(`Reply-To: ${sanitizeHeaderValue(replyTo)}`);
  }

  lines.push("", html || text);

  return lines.join("\r\n");
}

/** Exported for unit tests. Gmail requires base64url with no padding. */
export function toBase64Url(message: string): string {
  return Buffer.from(message, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Send an email via Google Workspace (Gmail API) using stored OAuth credentials.
 *
 * NOTE ON `auth`: this MUST be an OAuth2Client, not a bare token string.
 * `googleapis` treats a string `auth` as an **API key** and appends it as
 * `?key=<token>` with no Authorization header — Gmail then rejects the request
 * with 401 "API keys are not supported by this API", and the access token is
 * written into the request URL where it lands in access logs. See
 * google-workspace.test.ts, which asserts the Bearer header is present.
 */
export async function sendEmailViaGoogleWorkspace({
  accessToken,
  senderEmail,
  senderName,
  to,
  subject,
  text,
  html,
  replyTo,
}: {
  accessToken: string;
  senderEmail: string;
  senderName: string;
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
}): Promise<{ id: string }> {
  // `google.auth.OAuth2` is re-exported by googleapis, so this needs no
  // direct dependency on google-auth-library (which is only a transitive
  // dep and is not resolvable under pnpm's strict node_modules layout).
  const authClient = new google.auth.OAuth2();
  authClient.setCredentials({ access_token: accessToken });

  const gmail = google.gmail({ version: "v1", auth: authClient });

  const raw = toBase64Url(
    buildRfc2822Message({
      senderEmail,
      senderName,
      to,
      subject,
      text,
      html,
      replyTo,
    }),
  );

  try {
    const res = await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw },
    });

    if (!res.data.id) {
      throw new Error("Gmail API send failed: no message id returned");
    }

    return { id: res.data.id };
  } catch (error) {
    if (error instanceof GoogleWorkspaceReconnectRequired) throw error;
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Gmail API send failed: ${message}`);
  }
}

/**
 * Check if a sub-account has a connected Google Workspace config.
 *
 * Reads only the PUBLIC half of the config — the tokens now live in a
 * server-only secrets subcollection (see lib/comms/sub-account-secrets.ts),
 * so `accessToken` is no longer present on this object and must not be
 * treated as the readiness signal.
 */
export function googleWorkspaceIsConfigured(
  config?: GoogleWorkspaceConfig | null,
): boolean {
  if (!config) return false;
  return config.status === "connected" && !!config.senderEmail;
}

/**
 * Build a "From" address from Google Workspace config.
 * Used by `tenantFrom()` when googleWorkspaceConfig is present and valid.
 */
export function googleWorkspaceSenderEmail(
  config?: GoogleWorkspaceConfig | null,
): string | undefined {
  if (!googleWorkspaceIsConfigured(config)) return undefined;
  return config!.senderEmail;
}
