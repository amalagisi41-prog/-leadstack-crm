/**
 * Current sales campaign — the single source of truth for the deal's
 * NAME and SEAT COUNT.
 *
 * To switch to the next campaign over time, edit the values below and you're
 * done — every landing surface (hero, pricing card, announcement bar, CTAs,
 * FAQ, scarcity counter) reads from here.
 *
 * Intentionally NOT in here (kept inline in the components by design):
 *   - prices ($891 / $1,782) — change those in the pricing copy directly.
 *   - inclusion bullets on the pricing card.
 *
 * The INTERNAL plumbing keeps the legacy "founders" name on purpose
 * (route /api/checkout/founders, the use-founders-* hooks, the
 * STRIPE_FOUNDERS_PRICE_ID env var, the appConfig/foundersCohort Firestore
 * doc, and the Stripe `kind: "founders"` metadata). Those are invisible to
 * buyers and renaming them would break reconciliation of existing purchases.
 *
 * ⚠️ seatsTotal below is the CODE DEFAULT only. In production the live
 * Firestore doc `appConfig/foundersCohort.slotsTotal` OVERRIDES it — update
 * that doc too when you change the seat count (and reset soldCount/currentWave
 * for a fresh campaign).
 */
export const DEAL = {
  /** Campaign name — headlines, badges, pricing-card title, FAQ. */
  name: "The New Era Deal",

  /** Plural noun in the scarcity counter: "{sold} of {total} {memberNoun} claimed". */
  memberNoun: "spots",

  /** Cohort size (code default; see the Firestore override note above). */
  seatsTotal: 25,
} as const;
