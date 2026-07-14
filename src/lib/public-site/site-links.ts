import "server-only";

import { getAdminDb } from "@/lib/firebase/admin";
import type { SubAccountDoc } from "@/types";
import type { WebsiteDoc } from "@/types/website";
import type { BookingPage } from "@/types/booking";

/**
 * "Compose, don't rebuild" — AgentStack's AI Website Studio generates a
 * homepage via gitpage.site (a fixed 5-page-type API, see
 * `src/types/website.ts`), but a sub-account's real public footprint also
 * includes its native IDX listings search and booking pages. This helper is
 * the single source of truth for "what public pages does this sub-account
 * actually have right now" — reused by the public /idx + /b pages (shared
 * branded nav), the Website Studio's cta_link quick-pick, and its "Your
 * other pages" overview card. No new Firestore indexes: every query here is
 * a single equality filter, same posture as the rest of the Smart Workflows
 * time-trigger work this session.
 */

export interface SiteLinks {
  home: { url: string } | null;
  listings: { url: string } | null;
  booking: { url: string; slug: string; name: string }[];
}

function appOrigin(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
}

function toMillis(v: unknown): number {
  const m = v as { toMillis?: () => number } | null;
  return m && typeof m.toMillis === "function" ? m.toMillis() : 0;
}

export async function getSubAccountSiteLinks(
  subAccountId: string,
): Promise<SiteLinks> {
  const db = getAdminDb();
  const origin = appOrigin();

  const [subSnap, websiteSnap, bookingSnap] = await Promise.all([
    db.doc(`subAccounts/${subAccountId}`).get(),
    db.collection(`subAccounts/${subAccountId}/website`).get(),
    db.collection(`subAccounts/${subAccountId}/bookingPages`).get(),
  ]);

  const sub = subSnap.exists ? (subSnap.data() as SubAccountDoc) : null;

  // Home — the most recently updated published gitpage site, if any.
  const readySites = websiteSnap.docs
    .map((d) => d.data() as WebsiteDoc)
    .filter((w) => w.status === "ready" && !!w.liveUrl)
    .sort((a, b) => toMillis(b.updatedAt) - toMillis(a.updatedAt));
  const home = readySites[0]?.liveUrl ? { url: readySites[0].liveUrl } : null;

  // Listings — same gate the public /idx page itself checks.
  const listings =
    sub?.idxEnabledByAgency === true && sub?.idxConfig?.enabled
      ? { url: `${origin}/idx/${subAccountId}` }
      : null;

  // Booking — published pages only (draft links aren't shareable).
  const booking = bookingSnap.docs
    .map((d) => d.data() as BookingPage)
    .filter((p) => p.status === "published")
    .map((p) => ({
      url: `${origin}/b/${subAccountId}/${p.slug}`,
      slug: p.slug,
      name: p.name,
    }));

  return { home, listings, booking };
}
