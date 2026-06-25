import type { Quote, QuoteLineItem, QuoteStatus } from "@/types/quotes";

/**
 * Pure money math for a quote. NO Firestore, NO React, NO globals — all
 * inputs in, all outputs out. Same module imported by the operator
 * builder UI (live preview), the public quote page (recipient view),
 * the email template (preview thumbnail), and the "auto-create deal on
 * accept" flow (deal value = quote total).
 *
 * All values returned are in the quote's display currency, as decimal
 * numbers (not cents). Rounding is to 2 decimal places at the FINAL
 * step only — intermediate values stay full-precision to avoid
 * stacking rounding errors line-by-line.
 *
 * Tax model in v1: a single global tax % applied to (subtotal − discount).
 * Per-line tax rates are explicitly out of scope for v1.
 */

export interface QuoteTotals {
  /** Sum of qty × unitPrice across all line items. */
  subtotal: number;
  /** Amount removed by globalDiscount (positive number; subtract from
   *  subtotal to reach taxable amount). 0 when discount is null. */
  discountAmount: number;
  /** (subtotal − discount). The base the tax applies to. */
  taxableAmount: number;
  /** taxableAmount × (taxPercent / 100). 0 when tax is null. */
  taxAmount: number;
  /** taxableAmount + taxAmount, rounded to 2dp. The headline number. */
  total: number;
}

/** Compute every total in one pass. Safe to call on a draft mid-edit —
 *  empty lineItems → all zeros. */
export function computeQuoteTotals(
  quote: Pick<Quote, "lineItems" | "globalDiscount" | "globalTaxPercent">,
): QuoteTotals {
  const subtotal = quote.lineItems.reduce(
    (acc, item) => acc + lineItemSubtotal(item),
    0,
  );

  let discountAmount = 0;
  if (quote.globalDiscount) {
    if (quote.globalDiscount.type === "percent") {
      const pct = clamp(quote.globalDiscount.value, 0, 100);
      discountAmount = (subtotal * pct) / 100;
    } else {
      discountAmount = Math.max(0, quote.globalDiscount.value);
    }
  }
  // Discount can't take the bill below zero.
  discountAmount = Math.min(discountAmount, subtotal);

  const taxableAmount = subtotal - discountAmount;

  let taxAmount = 0;
  if (quote.globalTaxPercent != null) {
    const pct = clamp(quote.globalTaxPercent, 0, 100);
    taxAmount = (taxableAmount * pct) / 100;
  }

  const total = round2(taxableAmount + taxAmount);

  return {
    subtotal: round2(subtotal),
    discountAmount: round2(discountAmount),
    taxableAmount: round2(taxableAmount),
    taxAmount: round2(taxAmount),
    total,
  };
}

/** Subtotal for a single line item (qty × unitPrice, clamped >= 0). */
export function lineItemSubtotal(item: QuoteLineItem): number {
  const qty = Math.max(0, item.quantity);
  const price = Math.max(0, item.unitPrice);
  return qty * price;
}

/**
 * Read-time expiry check. Used both on the public quote page (so a
 * recipient can't accept an expired quote) and in the operator list
 * (so the status pill shows "Expired" without needing a background
 * sweep to write the stored status).
 *
 * Returns true when:
 *   - validUntil is set AND in the past
 *   - AND the quote isn't already in a terminal state (accepted, paid,
 *     declined) — once those are recorded, expiry is moot.
 */
export function isQuoteExpired(
  quote: Pick<Quote, "status" | "validUntil">,
  now: Date = new Date(),
): boolean {
  if (
    quote.status === "accepted" ||
    quote.status === "declined" ||
    quote.status === "paid"
  ) {
    return false;
  }
  if (!quote.validUntil) return false;
  const ts = quote.validUntil as { toMillis?: () => number; seconds?: number };
  let validUntilMs: number;
  if (typeof ts.toMillis === "function") {
    validUntilMs = ts.toMillis();
  } else if (typeof ts.seconds === "number") {
    validUntilMs = ts.seconds * 1000;
  } else {
    return false;
  }
  return validUntilMs < now.getTime();
}

/**
 * Returns the effective status to display — the stored status, OR
 * "expired" when the read-time check fires. Use this for the UI badge;
 * use `quote.status` directly when you need the persisted value (e.g.
 * for sorting or analytics).
 */
export function effectiveQuoteStatus(
  quote: Pick<Quote, "status" | "validUntil">,
  now: Date = new Date(),
): QuoteStatus {
  return isQuoteExpired(quote, now) ? "expired" : quote.status;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function round2(n: number): number {
  // Round-half-away-from-zero. Matches what Intl.NumberFormat displays
  // for currency, so the visible value and the stored value agree.
  return Math.round(n * 100) / 100;
}
