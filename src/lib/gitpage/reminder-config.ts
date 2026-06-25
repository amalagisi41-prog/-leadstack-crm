/**
 * Shared config for the Gitpage Agency bonus reminders — used by BOTH the
 * manual bulk route (/api/admin/gitpage-reminder) and the automated
 * 3-day-after-purchase reminder (/api/gitpage-reminder/step).
 */

/** Shared fallback code for buyers never issued a personal one (failed
 *  mint / pre-feature purchases). Must exist as a MULTI-use promo code on
 *  Gitpage's Stripe. */
export const SHARED_FALLBACK_CODE = "LSAGENCY";

/** Buyer emails to NEVER remind. Case-insensitive. */
export const REMINDER_EXCLUSIONS: string[] = [
  "kmotte@topofmindtech.com",
  "saucedabedoya@gmail.com",
  "rgarcia350@gmail.com",
  "ben@urbanhuntsman.co",
];

/** Lower-cased set for O(1) membership checks. */
export const REMINDER_EXCLUSION_SET = new Set(
  REMINDER_EXCLUSIONS.map((e) => e.trim().toLowerCase()),
);

/** Delay before the automated post-purchase reminder fires. */
export const REMINDER_DELAY_SECONDS = 3 * 24 * 60 * 60; // 3 days
