import "server-only";

import type { BookingPage } from "@/types/booking";

/**
 * Email template rendering for the booking lifecycle. Pure functions
 * — no Resend, no Firestore. Returns `{ subject, text, html }` that
 * the calling route hands to `sendEmail()`.
 *
 * Three template flavours:
 *   1. confirmation       — sent at booking time when no payment is required
 *   2. paymentPending     — sent at booking time when payment is required
 *   3. reminder           — sent T-24h / T-1h by the QStash callback
 *   4. cancelled          — sent on cancel (operator or visitor)
 *   5. paymentExpired     — sent when an unpaid hold auto-cancels
 *
 * Times are rendered in the booking page's timezone so the canonical
 * "what we agreed to" remains stable across visitor / operator views.
 * Adding a per-visitor timezone column is a v1.1 polish.
 */

export interface EmailRenderInput {
  /** Recipient display name (contact.name). Falls back to "there". */
  recipientName: string;
  /** Sub-account / business name. Goes in the salutation + header. */
  businessName: string;
  /** Optional logo URL for the header. */
  businessLogoUrl?: string | null;
  /** Booking page that produced this event. */
  page: Pick<BookingPage, "name" | "durationMinutes" | "timezone" | "payment" | "confirmationMessage">;
  /** Event start instant (UTC). */
  startAt: Date;
  /** Event end instant (UTC). */
  endAt: Date;
  /** Event location string (free text — e.g. "Phone: +61 ..." or "Zoom link follows"). */
  location?: string;
  /**
   * Video-call URL snapshotted from the booking page at booking time
   * (Zoom / Google Meet / Whereby / etc). When set, the confirmation +
   * reminder emails render a prominent "Join the meeting" CTA so
   * attendees can launch the call from the email directly.
   */
  meetingUrl?: string | null;
  /** /e/[token] URL for reschedule + cancel. Empty when APP_URL not set. */
  publicEventUrl: string;
  /** PayPal.me URL (only when payment is required). */
  paymentUrl?: string | null;
}

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

/** Format a UTC instant in the page's timezone, e.g. "Tue, 30 May 2026 · 14:00 AEST". */
function formatStartLocal(startAt: Date, tz: string): string {
  const fmt = new Intl.DateTimeFormat(undefined, {
    timeZone: tz,
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
  return fmt.format(startAt);
}

/** Render the confirmation email — pre-payment AND post-payment use this. */
export function renderBookingConfirmationEmail(
  input: EmailRenderInput,
): RenderedEmail {
  const whenLocal = formatStartLocal(input.startAt, input.page.timezone);
  const greeting = `Hi ${input.recipientName?.split(" ")[0] || "there"},`;
  const confirmation =
    input.page.confirmationMessage?.trim() ||
    `Your ${input.page.name} is confirmed.`;

  const subject = `Confirmed: ${input.page.name} on ${whenLocal}`;

  const text = [
    greeting,
    "",
    confirmation,
    "",
    `When: ${whenLocal} (${input.page.durationMinutes} min)`,
    input.meetingUrl ? `Join the meeting: ${input.meetingUrl}` : null,
    input.location ? `Where: ${input.location}` : null,
    "",
    input.publicEventUrl
      ? `Manage your booking (reschedule / cancel): ${input.publicEventUrl}`
      : null,
    "",
    `Thanks,`,
    input.businessName,
  ]
    .filter((s): s is string => s !== null)
    .join("\n");

  const html = wrapHtml(
    input.businessName,
    input.businessLogoUrl ?? null,
    `
      <h1 style="font-size:20px;margin:0 0 12px;">${escapeHtml(input.page.name)}</h1>
      <p style="margin:0 0 16px;color:#3a3a44;">${escapeHtml(greeting)}</p>
      <p style="margin:0 0 16px;">${escapeHtml(confirmation)}</p>
      <table role="presentation" style="width:100%;border-collapse:collapse;margin:16px 0 24px;background:#f6f7f9;border-radius:8px;">
        <tr><td style="padding:10px 16px;font-size:14px;"><strong>When:</strong> ${escapeHtml(whenLocal)} (${input.page.durationMinutes} min)</td></tr>
        ${input.location ? `<tr><td style="padding:0 16px 10px;font-size:14px;"><strong>Where:</strong> ${escapeHtml(input.location)}</td></tr>` : ""}
      </table>
      ${input.meetingUrl ? primaryCta(input.meetingUrl, "Join the meeting") : ""}
      ${input.publicEventUrl ? `<p style="margin:16px 0 0;font-size:13px;color:#6a6a74;">Need to reschedule or cancel? <a href="${escapeHtml(input.publicEventUrl)}" style="color:#0F766E;">Manage your booking</a>.</p>` : ""}
    `,
  );

  return { subject, text, html };
}

/** Visitor lands a slot but payment hasn't cleared yet. Tells them what to do. */
export function renderBookingPaymentPendingEmail(
  input: EmailRenderInput,
): RenderedEmail {
  if (!input.paymentUrl) {
    throw new Error("renderBookingPaymentPendingEmail requires paymentUrl");
  }
  const whenLocal = formatStartLocal(input.startAt, input.page.timezone);
  const amount = input.page.payment
    ? `${input.page.payment.currency} ${input.page.payment.amount}`
    : "your deposit";
  const greeting = `Hi ${input.recipientName?.split(" ")[0] || "there"},`;

  const subject = `Action needed: pay to confirm your ${input.page.name}`;

  const text = [
    greeting,
    "",
    `Your slot is held for ${input.page.name} on ${whenLocal}.`,
    "",
    `To lock it in, please pay ${amount} via PayPal:`,
    input.paymentUrl,
    "",
    `Once we see the payment land we'll send a confirmation. If we don't see it within ${input.page.payment?.holdHours ?? 24} hours, the slot will be released automatically.`,
    "",
    `Thanks,`,
    input.businessName,
  ].join("\n");

  const html = wrapHtml(
    input.businessName,
    input.businessLogoUrl ?? null,
    `
      <h1 style="font-size:20px;margin:0 0 12px;">Pay to confirm your booking</h1>
      <p style="margin:0 0 16px;color:#3a3a44;">${escapeHtml(greeting)}</p>
      <p style="margin:0 0 16px;">Your slot is <strong>held</strong> for ${escapeHtml(input.page.name)} on <strong>${escapeHtml(whenLocal)}</strong>.</p>
      <p style="margin:0 0 16px;">To lock it in, please pay <strong>${escapeHtml(amount)}</strong> via PayPal.</p>
      ${primaryCta(input.paymentUrl, `Pay ${amount}`)}
      <p style="margin:24px 0 0;font-size:13px;color:#6a6a74;">If we don't see the payment within ${input.page.payment?.holdHours ?? 24} hours, the slot is released automatically.</p>
    `,
  );

  return { subject, text, html };
}

/** Reminder email — sent at the configured offsets before the meeting. */
export function renderBookingReminderEmail(
  input: EmailRenderInput,
  minutesUntil: number,
): RenderedEmail {
  const whenLocal = formatStartLocal(input.startAt, input.page.timezone);
  const horizonLabel =
    minutesUntil >= 1440
      ? `${Math.round(minutesUntil / 1440)} day${minutesUntil >= 2880 ? "s" : ""}`
      : `${Math.max(1, Math.round(minutesUntil / 60))} hour${minutesUntil >= 120 ? "s" : ""}`;

  const subject = `Reminder: ${input.page.name} in ${horizonLabel}`;
  const greeting = `Hi ${input.recipientName?.split(" ")[0] || "there"},`;

  const text = [
    greeting,
    "",
    `Just a heads-up: ${input.page.name} is in ${horizonLabel}.`,
    "",
    `When: ${whenLocal} (${input.page.durationMinutes} min)`,
    input.meetingUrl ? `Join the meeting: ${input.meetingUrl}` : null,
    input.location ? `Where: ${input.location}` : null,
    "",
    input.publicEventUrl
      ? `Need to reschedule or cancel? ${input.publicEventUrl}`
      : null,
    "",
    `Thanks,`,
    input.businessName,
  ]
    .filter((s): s is string => s !== null)
    .join("\n");

  const html = wrapHtml(
    input.businessName,
    input.businessLogoUrl ?? null,
    `
      <h1 style="font-size:20px;margin:0 0 12px;">${escapeHtml(`In ${horizonLabel}: ${input.page.name}`)}</h1>
      <p style="margin:0 0 16px;color:#3a3a44;">${escapeHtml(greeting)}</p>
      <p style="margin:0 0 16px;">${escapeHtml(`Just a heads-up — your ${input.page.name} is in ${horizonLabel}.`)}</p>
      <table role="presentation" style="width:100%;border-collapse:collapse;margin:16px 0 24px;background:#f6f7f9;border-radius:8px;">
        <tr><td style="padding:10px 16px;font-size:14px;"><strong>When:</strong> ${escapeHtml(whenLocal)} (${input.page.durationMinutes} min)</td></tr>
        ${input.location ? `<tr><td style="padding:0 16px 10px;font-size:14px;"><strong>Where:</strong> ${escapeHtml(input.location)}</td></tr>` : ""}
      </table>
      ${input.meetingUrl ? primaryCta(input.meetingUrl, "Join the meeting") : ""}
      ${input.publicEventUrl ? `<p style="margin:16px 0 0;font-size:13px;color:#6a6a74;">Need to reschedule or cancel? <a href="${escapeHtml(input.publicEventUrl)}" style="color:#0F766E;">Manage your booking</a>.</p>` : ""}
    `,
  );

  return { subject, text, html };
}

/** Notify the visitor that the booking was cancelled (by them or the operator). */
export function renderBookingCancelledEmail(
  input: EmailRenderInput,
  reason: "by_visitor" | "by_operator" | "payment_expired",
): RenderedEmail {
  const whenLocal = formatStartLocal(input.startAt, input.page.timezone);
  const subject = `Cancelled: ${input.page.name} on ${whenLocal}`;
  const greeting = `Hi ${input.recipientName?.split(" ")[0] || "there"},`;
  const body =
    reason === "by_visitor"
      ? `Your ${input.page.name} on ${whenLocal} has been cancelled.`
      : reason === "payment_expired"
        ? `We didn't receive your payment in time, so your ${input.page.name} hold on ${whenLocal} has been released. Re-book any time.`
        : `Your ${input.page.name} on ${whenLocal} has been cancelled by the host.`;

  const text = [
    greeting,
    "",
    body,
    "",
    `Thanks,`,
    input.businessName,
  ].join("\n");

  const html = wrapHtml(
    input.businessName,
    input.businessLogoUrl ?? null,
    `
      <h1 style="font-size:20px;margin:0 0 12px;">Booking cancelled</h1>
      <p style="margin:0 0 16px;color:#3a3a44;">${escapeHtml(greeting)}</p>
      <p style="margin:0 0 16px;">${escapeHtml(body)}</p>
    `,
  );

  return { subject, text, html };
}

// ── Shared HTML scaffolding ──────────────────────────────────────────

function wrapHtml(
  businessName: string,
  logoUrl: string | null,
  body: string,
): string {
  return `<!doctype html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f6f7f9;margin:0;padding:24px;color:#1a1a22;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px;">
    <tr><td>
      ${logoUrl ? `<img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(businessName)}" style="max-height:40px;margin-bottom:24px;" />` : `<p style="margin:0 0 24px;font-size:13px;color:#6a6a74;letter-spacing:0.04em;text-transform:uppercase;">${escapeHtml(businessName)}</p>`}
      ${body}
    </td></tr>
  </table>
</body></html>`;
}

function primaryCta(href: string, label: string): string {
  return `<p style="margin:24px 0;">
    <a href="${escapeHtml(href)}" style="display:inline-block;background:#0F766E;color:#ffffff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:500;">${escapeHtml(label)}</a>
  </p>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
