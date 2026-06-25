import {
  collection,
  onSnapshot,
  query,
  where,
  type Unsubscribe,
} from "firebase/firestore";
import { getFirebaseDb } from "@/lib/firebase/client";
import type { CommunityGroup } from "@/types/community";

/**
 * Client-side subscription for the dashboard Community groups list. All writes
 * go through the Admin-SDK routes at /api/sub-accounts/[id]/community/* so the
 * client write path is closed at the rules level. The public /c/ pages fetch
 * server-side via the Admin SDK, so this read stays member-scoped.
 *
 * Single equality filter on `subAccountId` (auto-indexed). Groups per
 * sub-account are bounded; sorting happens client-side.
 */
export function subscribeToCommunityGroups(
  subAccountId: string,
  callback: (groups: CommunityGroup[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const q = query(
    collection(getFirebaseDb(), `subAccounts/${subAccountId}/communityGroups`),
    where("subAccountId", "==", subAccountId),
  );
  return onSnapshot(
    q,
    (snap) => {
      callback(
        snap.docs.map(
          (d) => ({ id: d.id, ...(d.data() as Omit<CommunityGroup, "id">) }),
        ),
      );
    },
    (err) => onError?.(err),
  );
}
