import "server-only";

import { emailIsConfigured, sendEmail } from "@/lib/comms/resend";
import { CUSTOM_BRAND } from "@/config/landing";
import type { GoogleWorkspaceConfig } from "@/types/tenancy";

/**
 * One-shot reminder sent ~24h after a new-agency Stripe checkout completes
 * if the buyer hasn't finished claiming their workspace at /welcome yet.
 * Carries a freshly re-minted claim link (see
 * /api/checkout/claim-reminder/step) rather than the original one, since
 * the original token is intentionally a one-time-use, time-boxed secret.
 *
 * Returns the Resend message id, or null when email isn't configured.
 */
export async function sendClaimReminderEmail({
  to,
  claimUrl,
  subAccountId,
  googleWorkspaceConfig,
}: {
  to: string;
  claimUrl: string;
  subAccountId?: string;
  googleWorkspaceConfig?: GoogleWorkspaceConfig;
}): Promise<string | null> {
  if (!emailIsConfigured()) {
    console.warn("[claim-reminder] email not configured — skipping");
    return null;
  }

  const subject = `Finish setting up your ${CUSTOM_BRAND.name} workspace`;

  const text = `Hi,

Thanks for your payment — but it looks like you haven't finished setting up your ${CUSTOM_BRAND.name} workspace yet.

It only takes a minute: pick a password and you're in.

Finish setup here:  ${claimUrl}

If you've already finished setting up, please ignore this email.

— The ${CUSTOM_BRAND.name} team`;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; color: #1a1a1a;">
      <p>Hi,</p>
      <p>Thanks for your payment — but it looks like you haven't finished setting up your <strong>${CUSTOM_BRAND.name}</strong> workspace yet.</p>
      <p>It only takes a minute: pick a password and you're in.</p>
      <p style="margin: 24px 0;">
        <a href="${claimUrl}" style="background: #1d4ed8; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">
          Finish setting up my workspace
        </a>
      </p>
      <p style="color: #6b7280; font-size: 13px;">If you've already finished setting up, please ignore this email.</p>
    </div>
  `;

  const result = await sendEmail({ to, subject, text, html, subAccountId, googleWorkspaceConfig });
  return result.id;
}

/**
 * Sent IMMEDIATELY when a new-agency checkout completes, carrying the claim
 * link so the buyer has it in writing.
 *
 * Before this existed, the claim link lived in exactly one place — the Stripe
 * `success_url`. A buyer who paid and then closed the tab had no way back into
 * the workspace they had just bought. The only recovery was the ~24h QStash
 * reminder above, which additionally requires QStash to be configured; on a
 * deployment without it, the customer was simply stranded, and the token
 * expires after 7 days regardless.
 *
 * This does NOT replace that reminder — the reminder still catches people who
 * received this, meant to come back, and didn't. It removes the single point
 * of failure.
 *
 * Returns the Resend message id, or null when email isn't configured. Never
 * throws: the caller is a Stripe webhook, and a non-2xx there makes Stripe
 * retry the whole event. A missed email must not turn into a retry storm
 * against an already-recorded purchase.
 */
export async function sendClaimLinkEmail({
  to,
  claimUrl,
}: {
  to: string;
  claimUrl: string;
}): Promise<string | null> {
  if (!emailIsConfigured()) {
    console.warn("[claim-link] email not configured — skipping");
    return null;
  }

  const subject = `Your ${CUSTOM_BRAND.name} workspace is ready`;

  const text = `Thanks for your payment.

Your ${CUSTOM_BRAND.name} workspace is ready — pick a password and you're in.

Set up your workspace:  ${claimUrl}

Keep this email. It's the link back to your workspace until you've finished setting it up.

— The ${CUSTOM_BRAND.name} team`;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; color: #1a1a1a;">
      <p>Thanks for your payment.</p>
      <p>Your <strong>${CUSTOM_BRAND.name}</strong> workspace is ready — pick a password and you're in.</p>
      <p style="margin: 24px 0;">
        <a href="${claimUrl}" style="background: #1d4ed8; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">
          Set up my workspace
        </a>
      </p>
      <p style="color: #6b7280; font-size: 13px;">Keep this email — it's the link back to your workspace until you've finished setting it up.</p>
    </div>
  `;

  try {
    const result = await sendEmail({ to, subject, text, html });
    return result.id;
  } catch (error) {
    console.error("[claim-link] send failed", error);
    return null;
  }
}
