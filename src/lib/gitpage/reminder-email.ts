import "server-only";

import { emailIsConfigured, sendEmail } from "@/lib/comms/resend";

/**
 * One-off reminder email nudging an existing LeadStack buyer to redeem
 * their (already-issued) Gitpage Agency bonus code before it expires.
 *
 * Reuses the buyer's stored `gitpageAgencyCode` — no re-mint. Soft
 * "expiring soon" urgency (codes were issued on a 90-day clock at varying
 * dates, so we avoid a hard date). Platform send (shared EMAIL_FROM).
 *
 * Returns the Resend message id, or null when email isn't configured.
 */

const REDEEM_URL = "https://www.gitpage.site/agency";
const VALUE = "$1,188";

export async function sendGitpageReminderEmail({
  to,
  code,
  /** True for a buyer's own single-use code; false for the shared
   *  fallback code (drops the "single-use / tied to you / don't share"
   *  line, which would be untrue for a shared code). */
  personalized = true,
}: {
  to: string;
  code: string;
  personalized?: boolean;
}): Promise<string | null> {
  if (!emailIsConfigured()) {
    console.warn("[gitpage/reminder] email not configured — skipping");
    return null;
  }

  const subject = `Your ${VALUE} LeadStack bonus is still unclaimed — don't let it expire`;

  const applyLine = personalized
    ? "Just apply the code at the agency checkout and activate. It's single-use and tied to your account, so please don't share it."
    : "Just apply the code at the agency checkout and activate your included access.";

  const text = `Hi,

Quick reminder about something included with your LeadStack purchase that we don't want you to miss.

You were issued a bonus code for Gitpage Agency — ${VALUE} value, free. It looks like it hasn't been redeemed yet, and the code will expire soon, so it's worth claiming now even if you're not ready to build your site today.

Your code:  ${code}

Redeem it here:  ${REDEEM_URL}

${applyLine}

Takes about two minutes — and it's ${VALUE} you've already paid for.

— The LeadStack team

P.S. If you've already redeemed your code, please ignore this email.`;

  const html = renderHtml(code, applyLine);

  const { id } = await sendEmail({ to, subject, text, html });
  return id;
}

function renderHtml(code: string, applyLine: string): string {
  return `<!doctype html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f1f5f9;margin:0;padding:24px;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;padding:28px 32px;">
    <div style="font-size:11px;text-transform:uppercase;color:#0a8a55;letter-spacing:0.08em;font-weight:700;">Included with your purchase</div>
    <h1 style="margin:8px 0 6px;font-size:22px;color:#0f172a;">Your ${esc(VALUE)} bonus is still unclaimed</h1>
    <p style="margin:0 0 18px;color:#475569;font-size:14px;line-height:1.6;">
      Your LeadStack purchase included <strong>12 months of Gitpage Agency — a ${esc(VALUE)} value, free</strong>. It looks like it hasn't been redeemed yet, and <strong>the code will expire soon</strong>, so it's worth claiming now even if you're not ready to build your site today.
    </p>

    <div style="background:linear-gradient(135deg,#e6fbf1 0%,#eef0ff 100%);border:1px solid #b8eed5;border-radius:10px;padding:18px 20px;margin:0 0 20px;">
      <p style="margin:0 0 8px 0;font-size:13px;color:#3a3a44;">Your code:</p>
      <p style="margin:0 0 16px 0;">
        <code style="background:#ffffff;padding:6px 12px;border-radius:6px;border:1px solid #b8eed5;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:15px;font-weight:700;color:#0a8a55;letter-spacing:0.04em;">${esc(code)}</code>
      </p>
      <a href="${REDEEM_URL}" style="display:inline-block;background:#0a8a55;color:#ffffff;text-decoration:none;padding:11px 20px;border-radius:8px;font-size:14px;font-weight:600;">Redeem at gitpage.site/agency</a>
    </div>

    <p style="margin:0 0 6px;color:#475569;font-size:13px;line-height:1.6;">
      ${esc(applyLine)}
    </p>
    <p style="margin:0 0 22px;color:#475569;font-size:13px;line-height:1.6;">
      Takes about two minutes — and it's ${esc(VALUE)} you've already paid for.
    </p>

    <p style="margin:0;color:#0f172a;font-size:14px;">— The LeadStack team</p>

    <p style="margin:22px 0 0;padding-top:16px;border-top:1px solid #e2e8f0;color:#94a3b8;font-size:12px;line-height:1.5;">
      P.S. If you've already redeemed your code, please ignore this email.
    </p>
  </div>
</body></html>`;
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
