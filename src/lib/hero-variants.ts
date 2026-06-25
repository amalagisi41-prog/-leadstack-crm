// Stub — the real hero-variant A/B/C test code is LeadStack-marketing-
// specific and is not shipped to the org repo. This stub preserves the
// public export shape so `webhooks.ts`, `hero-variant-server.ts`, and any
// other importer still type-checks. None of these exports do anything
// useful here — the related landing UI is also stubbed to hello-world.

export type HeroVariantId = "A" | "B" | "C";

export const HERO_VARIANT_IDS: HeroVariantId[] = ["A", "B", "C"];

export const HERO_VARIANT_COOKIE = "ls_hero_variant";

export const HERO_VARIANT_COOKIE_MAX_AGE_SECONDS = 90 * 24 * 60 * 60;

export interface HeroVariantCopy {
  id: HeroVariantId;
  label: string;
  headlinePre: string;
  headlineGradient: string;
  headlinePost: string;
  subhead: string;
}

export const HERO_VARIANTS: Record<HeroVariantId, HeroVariantCopy> = {
  A: { id: "A", label: "", headlinePre: "", headlineGradient: "", headlinePost: "", subhead: "" },
  B: { id: "B", label: "", headlinePre: "", headlineGradient: "", headlinePost: "", subhead: "" },
  C: { id: "C", label: "", headlinePre: "", headlineGradient: "", headlinePost: "", subhead: "" },
};

export function isHeroVariantId(value: unknown): value is HeroVariantId {
  return value === "A" || value === "B" || value === "C";
}

export function randomHeroVariant(): HeroVariantId {
  return "A";
}
