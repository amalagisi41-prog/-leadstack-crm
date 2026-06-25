import "server-only";

import { getAdminDb } from "@/lib/firebase/admin";
import { CUSTOM_BRAND, type ResolvedBrand } from "@/config/landing";
import type { AgencyDoc } from "@/types";

/**
 * Resolve the brand object passed to the custom landing components.
 *
 * Reads appConfig/main → firstAgencyId, then agencies/{firstAgencyId}, and
 * merges agency-doc field values over CUSTOM_BRAND defaults. Any field the
 * agency owner hasn't filled in yet falls back to the code-level default,
 * so a fresh deploy still renders cleanly before the owner has touched the
 * branding form.
 *
 * Failures (admin SDK not configured, doc missing, transient Firestore
 * errors) are swallowed — we never want the public landing to 500 on a
 * read error. Worst case: every field falls back to CUSTOM_BRAND.
 *
 * One read per page render today. If landing traffic grows, wrap with ISR
 * (`export const revalidate = 60` on the calling page) or memoize.
 */
export async function resolveCustomBrand(): Promise<ResolvedBrand> {
  const fallback: ResolvedBrand = {
    name: CUSTOM_BRAND.name,
    logoUrl: null,
    tagline: CUSTOM_BRAND.tagline,
    shortDescription: CUSTOM_BRAND.shortDescription,
    supportEmail: CUSTOM_BRAND.supportEmail,
    primaryDomain: CUSTOM_BRAND.primaryDomain,
  };

  try {
    const db = getAdminDb();
    const configSnap = await db.doc("appConfig/main").get();
    const firstAgencyId = configSnap.exists
      ? (configSnap.data()?.firstAgencyId as string | undefined)
      : undefined;
    if (!firstAgencyId) return fallback;

    const agencySnap = await db.doc(`agencies/${firstAgencyId}`).get();
    if (!agencySnap.exists) return fallback;
    const agency = agencySnap.data() as Partial<AgencyDoc>;

    return {
      name:
        agency.name && agency.name !== "LeadStack"
          ? agency.name
          : fallback.name,
      logoUrl: (agency.logoUrl as string | null) ?? null,
      tagline: fallback.tagline,
      shortDescription: fallback.shortDescription,
      supportEmail: agency.supportEmail || fallback.supportEmail,
      primaryDomain: agency.primaryDomain || fallback.primaryDomain,
    };
  } catch {
    return fallback;
  }
}
