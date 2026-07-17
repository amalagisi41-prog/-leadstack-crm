import "server-only";

import { emailIsConfigured, sendEmail } from "@/lib/comms/resend";
import { CUSTOM_BRAND } from "@/config/landing";

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
}: {
  to: string;
  claimUrl: string;
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

  const result = await sendEmail({ to, subject, text, html });
  return result.id;
}
