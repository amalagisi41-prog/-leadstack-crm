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

/** Env price ids pasted into a host UI often carry a trailing newline/space,
 *  which silently breaks every equality check below. */
function envPrice(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}
export const PLAN_KEYS: readonly PlanKey[] = SELF_SERVE_PLAN_KEYS;

export function planPriceId(
  key: PlanKey,
  interval: "month" | "year" = "month"
): string | null {
  switch (key) {
    case "starter":
      return interval === "year"
        ? envPrice("STRIPE_SOLO_ANNUAL_PRICE_ID")
        : (envPrice("STRIPE_SOLO_PRICE_ID") ?? envPrice("STRIPE_STARTER_PRICE_ID"));
    case "pro":
      return envPrice("STRIPE_PRO_PRICE_ID");
  }
}

export function planKeyForPriceId(priceId: string): PlanKey | null {
  for (const key of PLAN_KEYS) {
    if (
      planPriceId(key, "month") === priceId ||
      planPriceId(key, "year") === priceId
    )
      return key;
  }
  return null;
}

export function addOnPriceId(key: AddOnKey): string | null {
  switch (key) {
    case "idx":
      return envPrice("STRIPE_ADDON_IDX_PRICE_ID");
    case "social":
      return envPrice("STRIPE_ADDON_SOCIAL_PRICE_ID");
    case "website_studio":
      return envPrice("STRIPE_ADDON_WEBSITE_STUDIO_PRICE_ID");
  }
}

export function addOnKeyForPriceId(priceId: string): AddOnKey | null {
  for (const key of ADD_ON_KEYS) {
    if (addOnPriceId(key) === priceId) return key;
  }
  return null;
}

/** Reverse lookup used by the checkout webhook: which gate (if any) does
 *  this purchased Stripe price id correspond to. */
export function gateFieldForPriceId(priceId: string): string | null {
  for (const key of ADD_ON_KEYS) {
    if (addOnPriceId(key) === priceId) return ADD_ON_GATE_FIELD[key];
  }
  return null;
}

/**
 * Recognize a Stripe price even when the env id does not match it exactly
 * (a legacy/test price, a re-created price, or a missing env var): fall back
 * to `metadata.plan_key` / `metadata.addon_key` or the price lookup_key.
 */
export function planKeyForPrice(price: {
  id: string;
  lookup_key?: string | null;
  metadata?: Record<string, string> | null;
}): PlanKey | null {
  const byId = planKeyForPriceId(price.id);
  if (byId) return byId;
  const hint = (price.metadata?.plan_key ?? price.lookup_key ?? "").trim();
  if (!hint) return null;
  const normalized = hint === "solo" ? "starter" : hint;
  return (PLAN_KEYS as readonly string[]).includes(normalized)
    ? (normalized as PlanKey)
    : null;
}

export function addOnKeyForPrice(price: {
  id: string;
  lookup_key?: string | null;
  metadata?: Record<string, string> | null;
}): AddOnKey | null {
  const byId = addOnKeyForPriceId(price.id);
  if (byId) return byId;
  const hint = (price.metadata?.addon_key ?? price.lookup_key ?? "").trim();
  return (ADD_ON_KEYS as readonly string[]).includes(hint)
    ? (hint as AddOnKey)
    : null;
}
