import {
  collection,
  onSnapshot,
  query,
  where,
  type Unsubscribe,
} from "firebase/firestore";
import { getFirebaseDb } from "@/lib/firebase/client";
import type { AdAccountDoc } from "@/types/ad-accounts";

/**
 * Client-side subscription for a sub-account's "Ad Spend & Billing" page.
 * All writes go through the Admin-SDK routes at
 * /api/sub-accounts/[id]/ad-accounts/* so client writes are blocked at the
 * rules level (adAccounts is read-only for members, mirrors `products`).
 *
 * Single equality filter on `subAccountId` (auto-indexed — no composite
 * index needed). Rows per sub-account are bounded; sorting happens
 * client-side.
 */
export function subscribeToAdAccounts(
  subAccountId: string,
  callback: (accounts: AdAccountDoc[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const q = query(
    collection(getFirebaseDb(), "adAccounts"),
    where("subAccountId", "==", subAccountId),
  );
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map(
        (d) => ({ id: d.id, ...(d.data() as Omit<AdAccountDoc, "id">) }),
      );
      callback(list);
    },
    (err) => onError?.(err),
  );
}
