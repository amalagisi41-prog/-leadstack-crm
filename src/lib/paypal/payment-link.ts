import "server-only";

import type { Quote } from "@/types/quotes";
import type { PayPalConfig } from "@/types";
import { computeQuoteTotals } from "@/lib/quotes/calc";

/**
 * Build a paypal.me payment URL for an invoice.
 *
 * Format: `https://paypal.me/{username}/{amount}{currency}` where
 * amount is a decimal (e.g. `450.00`) and currency is an optional ISO
 * 4217 code. Without the currency suffix, PayPal uses the merchant's
 * primary currency.
 *
 * paypal.me supports: USD, GBP, EUR, AUD, CAD, BRL, CHF, CZK, DKK,
 * HKD, HUF, ILS, JPY, MXN, NOK, NZD, PHP, PLN, RUB, SEK, SGD, THB,
 * TWD. Anything else falls back to USD (paypal.me ignores unknown
 * codes silently).
 *
 * Pure function — no API call. paypal.me is a stateless URL service;
 * payments arrive in the merchant's PayPal balance and need to be
 * confirmed off-system before the operator marks the invoice paid.
 */

const PAYPAL_ME_CURRENCIES = new Set([
  "USD", "GBP", "EUR", "AUD", "CAD", "BRL", "CHF", "CZK", "DKK", "HKD",
  "HUF", "ILS", "JPY", "MXN", "NOK", "NZD", "PHP", "PLN", "RUB", "SEK",
  "SGD", "THB", "TWD",
]);

export function buildPaypalInvoiceUrl({
  paypal,
  invoice,
}: {
  paypal: PayPalConfig;
  invoice: Quote;
}): string {
  if (invoice.kind !== "invoice") {
    throw new Error("buildPaypalInvoiceUrl: quote.kind must be 'invoice'");
  }
  const totals = computeQuoteTotals(invoice);
  if (totals.total <= 0) {
    throw new Error(
      `Invoice ${invoice.quoteNumber} has a non-positive total — add line items before sending.`,
    );
  }

  // Two decimals — paypal.me expects standard amount formatting (e.g.
  // 1234.50). Strip any trailing zeros that would look weird in the
  // URL when integers are involved (e.g. 100 not 100.00).
  const amountStr =
    totals.total % 1 === 0
      ? String(totals.total)
      : totals.total.toFixed(2);

  const currency = (invoice.currency || "USD").toUpperCase();
  const currencySuffix = PAYPAL_ME_CURRENCIES.has(currency) ? currency : "";

  // Username is already sanitized at save time, but be defensive — strip
  // any leading slash or `paypal.me/` someone might have accidentally
  // included.
  const username = paypal.username
    .replace(/^https?:\/\//i, "")
    .replace(/^(www\.)?paypal\.me\//i, "")
    .replace(/^\//, "");

  return `https://paypal.me/${encodeURIComponent(username)}/${amountStr}${currencySuffix}`;
}

/**
 * Generic amount → paypal.me URL builder. Used by the booking deposit
 * flow (a slot-hold released after the operator manually marks paid).
 * Same URL format as `buildPaypalInvoiceUrl` but takes an explicit
 * amount + currency so the invoice-specific totals math is unneeded.
 */
export function buildPaypalAmountUrl({
  paypal,
  amount,
  currency,
}: {
  paypal: PayPalConfig;
  amount: number;
  currency: string;
}): string {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("buildPaypalAmountUrl: amount must be > 0");
  }
  const amountStr = amount % 1 === 0 ? String(amount) : amount.toFixed(2);
  const upper = currency.toUpperCase();
  const currencySuffix = PAYPAL_ME_CURRENCIES.has(upper) ? upper : "";
  const username = paypal.username
    .replace(/^https?:\/\//i, "")
    .replace(/^(www\.)?paypal\.me\//i, "")
    .replace(/^\//, "");
  return `https://paypal.me/${encodeURIComponent(username)}/${amountStr}${currencySuffix}`;
}
