import "server-only";

import { google } from "googleapis";
import type { GoogleWorkspaceConfig } from "@/types/tenancy";
import { getAdminDb } from "@/lib/firebase/admin";

/**
 * Check if the access token is expired or about to expire (within 5 minutes).
 */
export function isAccessTokenExpired(expiresAt: number): boolean {
  const fiveMinutesFromNow = Date.now() + 5 * 60 * 1000;
  return expiresAt < fiveMinutesFromNow;
}

/**
 * Refresh the access token using the refresh token.
 * Updates the stored config in Firestore and returns the new credentials.
 */
export async function refreshGoogleAccessToken(
  subAccountId: string,
  config: GoogleWorkspaceConfig,
): Promise<{
  accessToken: string;
  expiresAt: number;
}> {
  if (!config.refreshToken) {
    throw new Error(
      "Cannot refresh access token: no refresh token stored. User must reconnect.",
    );
  }

  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      "Google OAuth credentials not configured on this deployment",
    );
  }

  try {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "refresh_token",
        refresh_token: config.refreshToken,
      }).toString(),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(
        `Token refresh failed: ${response.status} ${error}`,
      );
    }

    const data = (await response.json()) as {
      access_token: string;
      expires_in: number;
    };

    const newExpiresAt = Date.now() + data.expires_in * 1000;

    // Update the stored config with the new access token and expiration
    const db = getAdminDb();
    await db
      .doc(`subAccounts/${subAccountId}`)
      .update({
        "googleWorkspaceConfig.accessToken": data.access_token,
        "googleWorkspaceConfig.expiresAt": newExpiresAt,
      });

    return {
      accessToken: data.access_token,
      expiresAt: newExpiresAt,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to refresh Google access token: ${message}`);
  }
}

/**
 * Send an email via Google Workspace (Gmail API) using stored OAuth credentials.
 * Automatically refreshes the access token if it's expired or about to expire.
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
  const gmail = google.gmail({ version: "v1", auth: accessToken });

  // Build the email message in RFC 2822 format
  const fromHeader = `${senderName} <${senderEmail}>`;
  const lines = [
    `From: ${fromHeader}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    `Content-Type: ${html ? 'text/html' : 'text/plain'}; charset="UTF-8"`,
    'MIME-Version: 1.0',
  ];

  if (replyTo) {
    lines.push(`Reply-To: ${replyTo}`);
  }

  lines.push('', html || text);

  const message = lines.join('\r\n');

  // Encode the message as base64url (Gmail API requirement)
  const encodedMessage = Buffer.from(message)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  try {
    const res = await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedMessage,
      },
    });

    if (!res.data.id) {
      throw new Error('Gmail API send failed: no message id returned');
    }

    return { id: res.data.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Gmail API send failed: ${message}`);
  }
}

/**
 * Check if a sub-account has a connected and valid Google Workspace config.
 */
export function googleWorkspaceIsConfigured(
  config?: GoogleWorkspaceConfig | null,
): boolean {
  if (!config) return false;
  return config.status === 'connected' && !!config.accessToken;
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
