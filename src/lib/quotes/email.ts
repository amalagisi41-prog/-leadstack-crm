import "server-only";

import { computeQuoteTotals } from "@/lib/quotes/calc";
import { formatCurrency } from "@/lib/format";
import type { Quote } from "@/types/quotes";

/**
 * Render the email a recipient receives when an operator sends them a
 * quote. Pure function — no Resend, no Firestore. Returns { subject,
 * text, html } that the /send route hands to the existing sendEmail
 * wrapper.
 *
 * Sender resolves via `tenantFrom(subAccount)` in the /send route — when
 * the sub-account has a verified dedicated sending domain, email goes out
 * from that domain; otherwise it falls back to the deployment-wide
 * EMAIL_FROM. The body still opens with the business name as a defense in
 * depth for the fallback (and for older mail clients that hide the From
 * display name). Reply-To is set by the caller to the operator's email so
 * replies route back to them directly.
 *
 * The link points at /q/[token] which is the public quote view page —
 * recipient can view, accept, or decline from there.
 */

export interface RenderQuoteEmailInput {
  quote: Quote;
  /** Display name of the sending business (sub-account.name). */
  businessName: string;
  /** Optional public https URL of the sub-account's logo. Renders in the
   *  email header above the business name when present. */
  businessLogoUrl?: string | null;
  /** Recipient's display name (contact.name); falls back to "there". */
  recipientName: string;
  /** Fully-qualified public URL: `${NEXT_PUBLIC_APP_URL}/q/${token}`. */
  publicUrl: string;
  /** Optional cover note from the operator. v2 surface; v1 callers
   *  always pass undefined. Plumbed through so adding it later doesn't
   *  ripple. */
  coverNote?: string;
}

export interface RenderedQuoteEmail {
  subject: string;
  text: string;
  html: string;
}

export function renderQuoteEmail(
  input: RenderQuoteEmailInput,
): RenderedQuoteEmail {
  const {
    quote,
    businessName,
    businessLogoUrl,
    recipientName,
    publicUrl,
    coverNote,
  } = input;
  const safeLogoUrl =
    typeof businessLogoUrl === "string" &&
    /^https?:\/\/.+/i.test(businessLogoUrl)
      ? businessLogoUrl
      : null;
  const isInvoice = quote.kind === "invoice";
  const docLabel = isInvoice ? "Invoice" : "Quote";
  const ctaText = isInvoice
    ? "View & pay invoice →"
    : "View & respond to quote →";
  const headlinePrefix = isInvoice
    ? "An invoice from"
    : "A quote from";
  const bodyLead = isInvoice
    ? `${businessName} has sent you an invoice.`
    : `${businessName} has prepared a quote for your review.`;

  const totals = computeQuoteTotals(quote);
  const totalDisplay = formatCurrency(totals.total, quote.currency);
  const validUntilLine =
    !isInvoice && quote.validUntil && hasToDate(quote.validUntil)
      ? `Valid until ${quote.validUntil.toDate().toLocaleDateString("en-GB", {
          day: "numeric",
          month: "short",
          year: "numeric",
        })}.`
      : null;
  const paymentDueLine =
    isInvoice && quote.paymentDueDays !== null
      ? formatPaymentDue(quote.paymentDueDays)
      : null;
  const headerExtraLine = paymentDueLine ?? validUntilLine;

  const safeRecipient = recipientName.trim() || "there";

  const subject = `${docLabel} from ${businessName} — ${quote.quoteNumber} (${totalDisplay})`;

  const text = [
    `Hi ${safeRecipient},`,
    "",
    bodyLead,
    "",
    `${docLabel}: ${quote.quoteNumber}`,
    `Total: ${totalDisplay}`,
    headerExtraLine,
    coverNote ? "" : null,
    coverNote ?? null,
    "",
    isInvoice
      ? "View and pay the invoice here:"
      : "View, accept, or decline the quote here:",
    publicUrl,
    "",
    "Reply to this email if you have any questions.",
    "",
    `— ${businessName}`,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f6f7f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:#0a0a0a;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f6f7f9;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" style="max-width:560px;background:#ffffff;border-radius:14px;border:1px solid #e8e8ec;overflow:hidden;">
          <tr>
            <td style="padding:28px 32px 8px 32px;">
              ${
                safeLogoUrl
                  ? `<img src="${escapeHtml(safeLogoUrl)}" alt="${escapeHtml(businessName)}" style="display:block;max-height:48px;max-width:200px;height:auto;width:auto;margin:0 0 12px 0;border:0;outline:none;text-decoration:none;" />`
                  : ""
              }
              <p style="margin:0 0 4px 0;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.12em;color:${isInvoice ? "#0a8a55" : "#5b5bd6"};">
                ${escapeHtml(docLabel)} ${escapeHtml(quote.quoteNumber)}
              </p>
              <h1 style="margin:0;font-size:22px;line-height:1.3;font-weight:600;letter-spacing:-0.01em;">
                ${escapeHtml(headlinePrefix)} ${escapeHtml(businessName)}
              </h1>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px 8px 32px;">
              <p style="margin:0 0 12px 0;font-size:15px;line-height:1.6;color:#1a1a22;">
                Hi ${escapeHtml(safeRecipient)},
              </p>
              <p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;color:#1a1a22;">
                ${escapeHtml(bodyLead)}
                ${headerExtraLine ? `<br /><strong>${escapeHtml(headerExtraLine)}</strong>` : ""}
              </p>
              ${
                coverNote
                  ? `<p style="margin:0 0 16px 0;padding:12px 14px;background:#f6f7f9;border-left:3px solid #5b5bd6;border-radius:4px;font-size:14px;line-height:1.5;color:#1a1a22;white-space:pre-wrap;">${escapeHtml(coverNote)}</p>`
                  : ""
              }
            </td>
          </tr>
          <tr>
            <td style="padding:8px 32px 16px 32px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f6f7f9;border-radius:8px;">
                <tr>
                  <td style="padding:14px 16px;font-size:13px;color:#6b6b75;">Total</td>
                  <td style="padding:14px 16px;text-align:right;font-size:22px;font-weight:700;color:#0a0a0a;font-variant-numeric:tabular-nums;">
                    ${escapeHtml(totalDisplay)}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 32px 24px 32px;" align="center">
              <a href="${escapeHtml(publicUrl)}" style="display:inline-block;background:${isInvoice ? "#0a8a55" : "#5b5bd6"};color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600;">
                ${escapeHtml(ctaText)}
              </a>
              <p style="margin:14px 0 0 0;font-size:12px;color:#6b6b75;">
                Or open this link in your browser:<br />
                <a href="${escapeHtml(publicUrl)}" style="color:${isInvoice ? "#0a8a55" : "#5b5bd6"};word-break:break-all;">${escapeHtml(publicUrl)}</a>
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px 28px 32px;border-top:1px solid #e8e8ec;">
              <p style="margin:0;font-size:13px;line-height:1.55;color:#6b6b75;">
                Reply to this email if you have any questions.<br />
                &mdash; ${escapeHtml(businessName)}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, text, html };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function hasToDate(value: unknown): value is { toDate: () => Date } {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { toDate?: unknown }).toDate === "function"
  );
}

function formatPaymentDue(days: number): string {
  if (days <= 0) return "Payment due on receipt.";
  if (days === 1) return "Payment due within 1 day.";
  return `Payment due within ${days} days.`;
}
