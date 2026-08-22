import "server-only";

import { google } from "googleapis";
import type { GoogleWorkspaceConfig } from "@/types/tenancy";

/**
 * Send an email via Google Workspace (Gmail API) using stored OAuth credentials.
 * Requires valid, non-expired access token.
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
