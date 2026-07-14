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
