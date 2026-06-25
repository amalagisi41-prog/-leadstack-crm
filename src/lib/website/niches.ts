import type {
  ColorScheme,
  Niche,
  WebsiteConfig,
} from "@/types/website";
import {
  sampleGymFitnessLocalConfig,
  sampleGymFitnessVslConfig,
  sampleHomeServicesLocalConfig,
  sampleHomeServicesVslConfig,
  sampleRealEstateLocalConfig,
  sampleRealEstateVslConfig,
} from "@/types/website";

/**
 * Niche metadata — single source of truth used by:
 *   - lib/gitpage/client.ts        (decides what to send)
 *   - lib/website/validation.ts    (per-niche field rules)
 *   - app/.../website/page.tsx     (picker tiles + sample buttons)
 *
 * The label and description are operator-facing copy. The default
 * colorScheme reflects gitpage's "natural surface" recommendation per
 * §4.1 of LEADSTACK_NICHE_TEMPLATES.md — always allow override.
 *
 * Forced page set is the same for every niche (per §2.2): index, services,
 * contact, privacy, terms. Blog is not allowed.
 */

export const NICHE_KEYS: readonly Niche[] = [
  "home_services",
  "real_estate",
  "gym_fitness",
] as const;

export interface NicheMeta {
  key: Niche;
  label: string;
  shortLabel: string;
  description: string;
  defaultColorScheme: ColorScheme;
  /** Single emoji used as the niche tile glyph. */
  emoji: string;
}

export const NICHE_META: Record<Niche, NicheMeta> = {
  home_services: {
    key: "home_services",
    label: "Home Services",
    shortLabel: "Home Services",
    description: "Plumbers / HVAC / Electricians / Roofers",
    defaultColorScheme: "Standard",
    emoji: "🔧",
  },
  real_estate: {
    key: "real_estate",
    label: "Real Estate",
    shortLabel: "Real Estate",
    description: "Buyers / Sellers / Investors",
    defaultColorScheme: "Standard",
    emoji: "🏠",
  },
  gym_fitness: {
    key: "gym_fitness",
    label: "Gyms & Fitness",
    shortLabel: "Gym & Fitness",
    description: "Studios / PTs / Boutique Gyms",
    defaultColorScheme: "Dark Mode",
    emoji: "💪",
  },
};

/**
 * Pages forced on by gitpage when a niche is set. Sent verbatim by the
 * gitpage client; mirrored to local_page_selections for UI consistency.
 */
export const NICHE_FORCED_PAGES = [
  "index.html",
  "services.html",
  "contact.html",
  "privacy.html",
  "terms.html",
] as const;

/** Page values gitpage explicitly rejects on niche builds. */
export const NICHE_FORBIDDEN_PAGES = ["blog.html", "blog-listing.html"] as const;

export function isNicheKey(value: unknown): value is Niche {
  return (
    typeof value === "string" &&
    (NICHE_KEYS as readonly string[]).includes(value)
  );
}

/**
 * Returns the right sample-config builder for a (niche, build type) pair.
 * Used by the Sample button in the website-builder UI.
 */
export function nicheSample(
  niche: Niche,
  buildType: "local" | "vsl",
): () => WebsiteConfig {
  switch (niche) {
    case "home_services":
      return buildType === "vsl"
        ? sampleHomeServicesVslConfig
        : sampleHomeServicesLocalConfig;
    case "real_estate":
      return buildType === "vsl"
        ? sampleRealEstateVslConfig
        : sampleRealEstateLocalConfig;
    case "gym_fitness":
      return buildType === "vsl"
        ? sampleGymFitnessVslConfig
        : sampleGymFitnessLocalConfig;
  }
}
