import { collection, onSnapshot, type Unsubscribe } from "firebase/firestore";
import { getFirebaseDb } from "@/lib/firebase/client";
import type { IdxListingDoc } from "@/types/idx";

/**
 * Client-side subscription for the operator's IDX Listings browser
 * (`/sa/[id]/idx`). Direct subcollection query (no `subAccountId` where
 * filter needed — it's implicit in the path, same shape as
 * `whatsappTemplates`). All writes go through the sync pipeline
 * (lib/idx/sync.ts) via Admin-SDK routes; rules are read-only for members.
 */
export function subscribeToIdxListings(
  subAccountId: string,
  callback: (listings: IdxListingDoc[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  return onSnapshot(
    collection(getFirebaseDb(), `subAccounts/${subAccountId}/idxListings`),
    (snap) => {
      const list = snap.docs.map((d) => d.data() as IdxListingDoc);
      callback(list);
    },
    (err) => onError?.(err),
  );
}
