import "server-only";

import {
  ADD_ON_GATE_FIELD,
  ADD_ON_KEYS,
  ADD_ON_LOOKUP_KEY,
  ADD_ON_PRICE_ENV_VAR,
  type AddOnKey,
} from "./addon-catalog";
import { getStripeServer } from "./server";
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
export { ADD_ON_KEYS, ADD_ON_GATE_FIELD, ADD_ON_PRICE_ENV_VAR };

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

const LOOKUP_CACHE_MS = 5 * 60 * 1000;
let lookupCache: { at: number; ids: Partial<Record<AddOnKey, string>> } | null = null;

/**
 * The Stripe price id for an add-on: the env var when set, otherwise the
 * active price carrying the add-on's lookup key (cached for 5 minutes).
 * Returns null only when neither exists; callers must log that as a
 * configuration problem, never show it to the customer.
 */
export async function resolveAddOnPriceId(key: AddOnKey): Promise<string | null> {
  const fromEnv = addOnPriceId(key);
  if (fromEnv) return fromEnv;
  if (!lookupCache || Date.now() - lookupCache.at > LOOKUP_CACHE_MS) {
    const ids: Partial<Record<AddOnKey, string>> = {};
    try {
      const prices = await getStripeServer().prices.list({
        lookup_keys: ADD_ON_KEYS.map((k) => ADD_ON_LOOKUP_KEY[k]),
        active: true,
        limit: 10,
      });
      for (const price of prices.data) {
        const match = ADD_ON_KEYS.find((k) => ADD_ON_LOOKUP_KEY[k] === price.lookup_key);
        if (match) ids[match] = price.id;
      }
    } catch (error) {
      console.error("[billing-config] Could not look up add-on prices in Stripe", error);
      return null;
    }
    lookupCache = { at: Date.now(), ids };
  }
  return lookupCache.ids[key] ?? null;
}

/** Test hook: forget cached lookup-key prices. */
export function resetAddOnPriceCache() {
  lookupCache = null;
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
/** Lookup keys the setup script stamps on the plan prices. */
export const PLAN_LOOKUP_KEY: Record<PlanKey, string> = {
  starter: "agentstack_solo_monthly",
  pro: "agentstack_team_monthly",
};

export function planKeyForPrice(price: {
  id: string;
  lookup_key?: string | null;
  metadata?: Record<string, string> | null;
  /** The price's product metadata, when the product was expanded. */
  product_metadata?: Record<string, string> | null;
}): PlanKey | null {
  const byId = planKeyForPriceId(price.id);
  if (byId) return byId;
  const hint = (
    price.metadata?.plan_key ??
    price.product_metadata?.plan_key ??
    price.lookup_key ??
    ""
  ).trim();
  if (!hint) return null;
  const normalized =
    hint === "solo" || hint === PLAN_LOOKUP_KEY.starter
      ? "starter"
      : hint === PLAN_LOOKUP_KEY.pro
        ? "pro"
        : hint;
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
  if ((ADD_ON_KEYS as readonly string[]).includes(hint)) return hint as AddOnKey;
  return ADD_ON_KEYS.find((k) => ADD_ON_LOOKUP_KEY[k] === hint) ?? null;
}
