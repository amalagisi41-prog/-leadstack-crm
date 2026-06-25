import {
  collection,
  onSnapshot,
  query,
  where,
  type Unsubscribe,
} from "firebase/firestore";
import { getFirebaseDb } from "@/lib/firebase/client";
import type { TerritoryDoc } from "@/types";

/**
 * Client-side subscription for the per-sub-account territories list.
 * Used by the settings section, member assignment picker, new-deal /
 * contact-form pickers, pipeline filter chip, and contacts table column.
 * Writes go exclusively through the Admin SDK routes under
 * /api/sub-accounts/[id]/territories/*.
 *
 * Filters by `subAccountId` even though the docs sit in a subcollection
 * — the redundant field is stamped on every write so the listener can
 * use a where-clause for index-friendliness and so the doc round-trips
 * cleanly through the bulk-export path if we add one later.
 */
export function subscribeToTerritories(
  subAccountId: string,
  callback: (territories: TerritoryDoc[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const q = query(
    collection(getFirebaseDb(), "subAccounts", subAccountId, "territories"),
    where("subAccountId", "==", subAccountId),
  );
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map(
        (d) => ({ id: d.id, ...(d.data() as Omit<TerritoryDoc, "id">) }),
      );
      list.sort((a, b) => a.name.localeCompare(b.name));
      callback(list);
    },
    (err) => onError?.(err),
  );
}
