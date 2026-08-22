import "server-only";

import { Resend } from "resend";

import type { GoogleWorkspaceConfig, ResendConfig } from "@/types/tenancy";
import {
  sendEmailViaGoogleWorkspace,
  googleWorkspaceIsConfigured,
  isAccessTokenExpired,
  refreshGoogleAccessToken,
} from "./google-workspace";

let _client: Resend | null = null;

export function getResend(): Resend {
  if (!_client) {
    const key = process.env.RESEND_API_KEY;
    if (!key) {
      throw new Error(
        "RESEND_API_KEY is not set. Add it to .env.local to enable email.",
      );
    }
    _client = new Resend(key);
  }
  return _client;
}

export function emailIsConfigured(): boolean {
  // `.trim()` so a present-but-blank env var doesn't read as configured.
  return (
    !!process.env.RESEND_API_KEY?.trim() && !!process.env.EMAIL_FROM?.trim()
  );
}

/**
 * Resolves the From address for a sub-account under the platform-managed
 * sending model. Returns the tenant's dedicated sending-domain address only
 * when BOTH the agency-controlled gate is on AND the domain is verified;
 * otherwise undefined, so `sendEmail` falls back to the shared EMAIL_FROM.
 * The double check is deliberate: if an agency flips the gate off while a
 * verified resendConfig is still on the doc, runtime sending immediately
 * reverts to shared without waiting for the cleanup write.
 *
 * Pass the result straight into `sendEmail({ ..., from })`.
 */
export function tenantFrom(
  sub?: {
    resendConfig?: ResendConfig | null;
    emailDomainEnabledByAgency?: boolean;
  } | null,
): string | undefined {
  if (sub?.emailDomainEnabledByAgency !== true) return undefined;
  const cfg = sub.resendConfig;
  return cfg && cfg.status === "verified" ? cfg.emailFrom : undefined;
}

export async function sendEmail({
  to,
  subject,
  text,
  html,
  replyTo,
  from,
  googleWorkspaceConfig,
  subAccountId,
}: {
  to: string;
  subject: string;
  /** Plain-text fallback. Required so clients that don't render HTML still get content. */
  text: string;
  /** Optional rich-text body. Resend uses html when present, text as fallback. */
  html?: string;
  replyTo?: string;
  /**
   * Per-sub-account sender override. When a sub-account has a verified
   * dedicated sending domain, pass its `emailFrom` here (use `tenantFrom`).
   * Omit for platform/transactional sends — falls back to the deployment-wide
   * EMAIL_FROM shared sender.
   */
  from?: string;
  /**
   * Optional Google Workspace config. When provided and properly configured,
   * sends via Gmail API instead of Resend.
   */
  googleWorkspaceConfig?: GoogleWorkspaceConfig | null;
  /**
   * Optional sub-account ID. Required when using Google Workspace to handle token refresh.
   */
  subAccountId?: string;
}): Promise<{ id: string }> {
  // Route to Google Workspace if configured
  if (googleWorkspaceIsConfigured(googleWorkspaceConfig)) {
    let accessToken = googleWorkspaceConfig!.accessToken;
    const expiresAt = googleWorkspaceConfig!.expiresAt;

    // Refresh the token if it's expired or about to expire
    if (expiresAt && isAccessTokenExpired(expiresAt) && subAccountId) {
      try {
        const refreshed = await refreshGoogleAccessToken(
          subAccountId,
          googleWorkspaceConfig!,
        );
        accessToken = refreshed.accessToken;
      } catch (error) {
        // Log the refresh error but attempt to send with the current token anyway
        // The Gmail API might still accept it, or we'll get a clear auth error to display
        console.warn(
          `[sendEmail] Token refresh failed for sub-account ${subAccountId}:`,
          error,
        );
      }
    }

    return sendEmailViaGoogleWorkspace({
      accessToken,
      senderEmail: googleWorkspaceConfig!.senderEmail,
      senderName: googleWorkspaceConfig!.senderName,
      to,
      subject,
      text,
      html,
      replyTo,
    });
  }

  // Fall back to Resend
  const resolvedFrom = from ?? process.env.EMAIL_FROM;
  if (!resolvedFrom) {
    throw new Error(
      "EMAIL_FROM is not set. It must be a sender on a Resend-verified domain.",
    );
  }
  const client = getResend();
  const result = await client.emails.send({
    from: resolvedFrom,
    to,
    subject,
    text,
    ...(html ? { html } : {}),
    replyTo,
  });
  if (result.error) {
    throw new Error(result.error.message || "Resend send failed");
  }
  if (!result.data?.id) {
    throw new Error("Resend send failed: no message id returned");
  }
  return { id: result.data.id };
}
