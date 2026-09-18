import "server-only";

import { getAdminDb } from "@/lib/firebase/admin";
import {
  hydrateSiteListings,
  referencedListingIds,
} from "@/lib/website-studio/listing-cards";
import type { AgentSiteContent } from "@/types/agent-site";
import type { IdxListingDoc } from "@/types/idx";

/**
 * Resolve a published site's referenced listing cards against live inventory.
 *
 * Both published-site routes (`/agent/[subAccountId]/[slug]` and
 * `/agent/by-domain/[host]`) call this, because they differ only in how they
 * find the sub-account and never in what they render.
 *
 * Best-effort on purpose: a site is public marketing, so a Firestore hiccup
 * must not 500 the whole page. On failure every card falls back to its stored
 * snapshot, which is the same result as a card that never referenced anything.
 */
export async function hydrateSiteContent(
  content: AgentSiteContent,
  subAccountId: string
): Promise<AgentSiteContent> {
  const cards = content.listings ?? [];
  const ids = referencedListingIds(cards);
  if (ids.length === 0) return content;

  try {
    const db = getAdminDb();
    const refs = ids.map((id) =>
      db.doc(`subAccounts/${subAccountId}/idxListings/${id}`)
    );
    const snaps = await db.getAll(...refs);
    const byId = new Map<string, IdxListingDoc>();
    for (const snap of snaps) {
      if (!snap.exists) continue;
      byId.set(snap.id, {
        id: snap.id,
        ...(snap.data() as Omit<IdxListingDoc, "id">),
      });
    }
    return {
      ...content,
      listings: hydrateSiteListings(cards, byId, subAccountId),
    };
  } catch {
    return content;
  }
}
