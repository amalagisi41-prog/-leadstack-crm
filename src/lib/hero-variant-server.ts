import "server-only";

import type { HeroVariantId } from "@/lib/hero-variants";

// Stub — see publish/README.md.
export async function resolveHeroVariant(): Promise<HeroVariantId> {
  return "A";
}
