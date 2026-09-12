import "server-only";

import type { Firestore } from "firebase-admin/firestore";
import { syncIdxListings } from "@/lib/idx/sync";
import type { IdxListingDoc } from "@/types/idx";
import {
  listingMatchesAddress,
  listingMatchesIdentifier,
} from "@/lib/marketing/campaign-route-helpers";

export async function findCampaignListing(db: Firestore, subAccountId: string, identifier: string): Promise<IdxListingDoc | null> {
  const listingsCol = db.collection(`subAccounts/${subAccountId}/idxListings`);
  const direct = await listingsCol.doc(identifier).get();
  if (direct.exists) return { id: direct.id, ...(direct.data() as Omit<IdxListingDoc, "id">) };

  const findInCache = async (): Promise<IdxListingDoc | null> => {
    const snap = await listingsCol.get();
    const found = snap.docs.find((doc) => {
      const listing = {
        id: doc.id,
        ...(doc.data() as Omit<IdxListingDoc, "id">),
      };
      return (
        listingMatchesIdentifier(listing, identifier) ||
        listingMatchesAddress(listing, identifier)
      );
    });
    return found ? { id: found.id, ...(found.data() as Omit<IdxListingDoc, "id">) } : null;
  };

  const cached = await findInCache();
  if (cached) return cached;
  const sync = await syncIdxListings(subAccountId);
  return sync.ok ? findInCache() : null;
}
