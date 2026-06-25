/**
 * Shared shape + defaults for the landing page's exit-intent discount offer.
 * Persisted at `appConfig/exitIntentModal` (server-only writes via the Admin
 * SDK; public read for the unauthenticated landing page). Kept free of any
 * client-only imports so both the client read-hook and server components can
 * import it.
 *
 * The dollar amount + copy are DISPLAY ONLY — the real discount is whatever
 * the Stripe coupon behind `couponCode` is configured to take off. Keep the
 * two in sync (see /agency/landing editor + the checkout lookup in
 * /api/checkout/founders).
 */
export interface ExitIntentConfig {
  /** Master on/off. When false the popup never arms. */
  enabled: boolean;
  /** Stripe promotion code applied at checkout, e.g. "GET200". */
  couponCode: string;
  /** Whole-dollar amount shown in the copy. Cosmetic — see note above. */
  discountAmount: number;
  /** Manual scarcity counters. Not wired to Stripe's real redemption count. */
  couponsTotal: number;
  couponsUsed: number;
}

/**
 * Defaults mirror the values the modal shipped with hardcoded, so the public
 * popup behaves identically until the agency owner saves once (or if the doc
 * is missing / Firebase isn't configured).
 */
export const EXIT_INTENT_DEFAULTS: ExitIntentConfig = {
  enabled: true,
  couponCode: "GET200",
  discountAmount: 200,
  couponsTotal: 10,
  couponsUsed: 8,
};

/** Normalize an untrusted Firestore payload to a complete, valid config. */
export function coerceExitIntentConfig(
  data: Partial<ExitIntentConfig> | undefined | null,
): ExitIntentConfig {
  if (!data) return { ...EXIT_INTENT_DEFAULTS };
  const numOr = (v: unknown, fallback: number) =>
    typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : fallback;
  return {
    enabled:
      typeof data.enabled === "boolean"
        ? data.enabled
        : EXIT_INTENT_DEFAULTS.enabled,
    couponCode:
      typeof data.couponCode === "string" && data.couponCode.trim()
        ? data.couponCode.trim()
        : EXIT_INTENT_DEFAULTS.couponCode,
    discountAmount: numOr(
      data.discountAmount,
      EXIT_INTENT_DEFAULTS.discountAmount,
    ),
    couponsTotal: numOr(data.couponsTotal, EXIT_INTENT_DEFAULTS.couponsTotal),
    couponsUsed: numOr(data.couponsUsed, EXIT_INTENT_DEFAULTS.couponsUsed),
  };
}

/** Coupons still on offer. Drives the scarcity badge; at 0 the popup hides. */
export function exitCouponsRemaining(c: ExitIntentConfig): number {
  return Math.max(0, c.couponsTotal - c.couponsUsed);
}
