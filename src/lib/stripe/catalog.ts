import "server-only";

import { ADD_ON_GATE_FIELD, ADD_ON_KEYS, type AddOnKey } from "./addon-catalog";
import { SELF_SERVE_PLAN_KEYS, type SelfServePlanKey } from "@/config/landing";

/**
 * Resolves the stable plan/add-on KEYS the client sends into real Stripe
 * price ids (env-var-driven) and back into the feature-gate field an add-on
 * unlocks. Centralizing this here means the client never needs to know a
 * raw Stripe price id — it only ever sends/receives keys — and the webhook
 * can reverse-map a purchased price id to the gate it should flip.
 *
 * Of the 9 add-ons marketed on the landing page, only these 3 correspond to
 * a real in-app feature gate — the rest (Custom Website Build, Review
 * Manager, Google Business Profile, Google Ads Management, AI Listing Copy,
 * White-Glove Setup) are done-for-you services with no togglable feature to
 * auto-activate; they're billed (if at all) outside this flow.
 *
 * The key/gate constants live in `addon-catalog.ts` (no env-var access) so
 * client components can import them directly; this module re-exports them
 * alongside the functions that actually touch `process.env`.
 */

export type { AddOnKey };
export { ADD_ON_KEYS, ADD_ON_GATE_FIELD };

export type PlanKey = SelfServePlanKey;
export const PLAN_KEYS: readonly PlanKey[] = SELF_SERVE_PLAN_KEYS;

export function planPriceId(key: PlanKey): string | null {
  switch (key) {
    case "starter":
      return process.env.STRIPE_STARTER_PRICE_ID ?? null;
    case "pro":
      return process.env.STRIPE_PRO_PRICE_ID ?? null;
  }
}

export function addOnPriceId(key: AddOnKey): string | null {
  switch (key) {
    case "idx":
      return process.env.STRIPE_ADDON_IDX_PRICE_ID ?? null;
    case "social":
      return process.env.STRIPE_ADDON_SOCIAL_PRICE_ID ?? null;
    case "website_studio":
      return process.env.STRIPE_ADDON_WEBSITE_STUDIO_PRICE_ID ?? null;
  }
}

/** Reverse lookup used by the checkout webhook: which gate (if any) does
 *  this purchased Stripe price id correspond to. */
export function gateFieldForPriceId(priceId: string): string | null {
  for (const key of ADD_ON_KEYS) {
    if (addOnPriceId(key) === priceId) return ADD_ON_GATE_FIELD[key];
  }
  return null;
}
