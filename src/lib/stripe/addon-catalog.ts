/**
 * Client-safe constants for the 3 add-ons with a real in-app feature gate
 * (IDX, Social Planner, AI Website Studio) — no env-var access, safe to
 * import from client components. `lib/stripe/catalog.ts` (server-only)
 * re-exports these alongside the price-id resolution functions that DO
 * touch `process.env`. Mirrors the existing meta.ts / meta-capabilities.ts
 * split (server-only vs. client-safe halves of the same feature).
 */

export type AddOnKey = "idx" | "social" | "website_studio";

export const ADD_ON_KEYS: AddOnKey[] = ["idx", "social", "website_studio"];

/** The SubAccountDoc boolean field each add-on unlocks. */
export const ADD_ON_GATE_FIELD: Record<AddOnKey, string> = {
  idx: "idxEnabledByAgency",
  social: "socialPlannerEnabledByAgency",
  website_studio: "websiteStudioEnabledByAgency",
};

export const ADD_ON_LABELS: Record<AddOnKey, { name: string; price: string }> = {
  idx: { name: "IDX Core", price: "$60/mo" },
  social: { name: "Social Planner", price: "$29/mo" },
  website_studio: { name: "AI Website Studio", price: "$99/mo" },
};

/**
 * The env var each add-on's Stripe price id comes from — not a secret, just
 * a name, so it's safe alongside the other client-visible constants above.
 * Read by the add-ons route to name the exact missing var in its error
 * instead of a generic "not configured," and by the Settings UI to show
 * the same name inline so the agency owner knows exactly what to set.
 */
export const ADD_ON_PRICE_ENV_VAR: Record<AddOnKey, string> = {
  idx: "STRIPE_ADDON_IDX_PRICE_ID",
  social: "STRIPE_ADDON_SOCIAL_PRICE_ID",
  website_studio: "STRIPE_ADDON_WEBSITE_STUDIO_PRICE_ID",
};
