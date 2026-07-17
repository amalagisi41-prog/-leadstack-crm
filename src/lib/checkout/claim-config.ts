/**
 * Shared config for the new-agency claim-token lifecycle: minted by the
 * Stripe webhook at purchase time, re-minted by the reminder step if the
 * buyer hasn't claimed yet, validated by `/api/auth/claim-subscription`.
 */

/** How long a claim token is valid before /welcome refuses it. */
export const CLAIM_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

/**
 * Delay before the one-shot "finish setting up your workspace" reminder
 * fires for a purchase that hasn't been claimed yet. Re-mints the token
 * (extending the window by another CLAIM_TOKEN_TTL_SECONDS from then) so a
 * buyer who paid but got distracted still has a working link to come back
 * to instead of a dead one.
 */
export const CLAIM_REMINDER_DELAY_SECONDS = 24 * 60 * 60; // 1 day
