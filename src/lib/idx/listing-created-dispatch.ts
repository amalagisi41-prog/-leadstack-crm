import "server-only";

import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { buildContentBrief } from "@/lib/marketing/content-brief";
import type { IdxListingDoc } from "@/types/idx";
import type { CampaignBriefDoc } from "@/types/marketing-campaigns";

/**
 * Auto-drafts a campaign brief for a listing genuinely new to the
 * workspace's inventory — never routed through the Workflow engine, which
 * every run enrolls one contact against (fireWorkflowTrigger) and a
 * newly-synced listing has none. This calls the same buildContentBrief() the
 * manual "+ New campaign" route uses, so an auto-drafted brief is
 * structurally identical to one an operator built by hand.
 *
 * Opt-in (idxConfig.autoDraftOnNewListing) and strictly a DRAFT: nothing
 * here ever sets approvedChannels or publishes anything. The compliance
 * gate every listing-campaign tool already enforces (tool-registry.ts) is
 * untouched — this only skips the one manual step of clicking "+ New
 * campaign" after a sync.
 */

const SYSTEM_DRAFT_UID = "system:idx-auto-draft";

/** Only active listings are worth drafting — a new pending/off-market row has nothing to promote yet. */
export function listingsEligibleForAutoDraft(
  listings: readonly IdxListingDoc[]
): IdxListingDoc[] {
  return listings.filter((l) => l.status === "active");
}

export async function draftCampaignsForNewListings(
  db: Firestore,
  subAccountId: string,
  agencyId: string,
  newListings: readonly IdxListingDoc[]
): Promise<{ drafted: number; errors: string[] }> {
  let drafted = 0;
  const errors: string[] = [];

  for (const listing of listingsEligibleForAutoDraft(newListings)) {
    try {
      const ref = db.doc(`subAccounts/${subAccountId}/campaignBriefs/${listing.id}`);
      // Defensive — a new-to-inventory listing shouldn't already have a
      // brief, but never overwrite one that exists for any reason.
      const existing = await ref.get();
      if (existing.exists) continue;

      const brief = buildContentBrief(listing);
      const now = FieldValue.serverTimestamp();
      const payload: Omit<CampaignBriefDoc, "id"> = {
        agencyId,
        subAccountId,
        listingId: listing.id,
        createdByUid: SYSTEM_DRAFT_UID,
        brief,
        approvedChannels: [],
        createdAt: now,
        updatedAt: now,
      };
      await ref.set(payload);
      drafted += 1;
    } catch (error) {
      errors.push(
        `${listing.id}: ${error instanceof Error ? error.message : "auto-draft failed"}`
      );
    }
  }

  return { drafted, errors };
}
