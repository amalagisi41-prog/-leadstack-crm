import {
  collection,
  onSnapshot,
  query,
  where,
  type Unsubscribe,
} from "firebase/firestore";
import { getFirebaseDb } from "@/lib/firebase/client";
import type { SocialPostDoc } from "@/types/social";

/**
 * Client-side subscription for the Social Planner content calendar + list.
 * All writes go through the Admin-SDK routes at
 * /api/sub-accounts/[id]/social/* so client writes are blocked at the rules
 * level (socialPosts is read-only for members).
 *
 * Single equality filter on `subAccountId` (auto-indexed — no composite
 * index needed). Posts per sub-account are bounded; sorting + date bucketing
 * happen client-side.
 */
export function subscribeToSocialPosts(
  subAccountId: string,
  callback: (posts: SocialPostDoc[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const q = query(
    collection(getFirebaseDb(), "socialPosts"),
    where("subAccountId", "==", subAccountId),
  );
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map(
        (d) => ({ id: d.id, ...(d.data() as Omit<SocialPostDoc, "id">) }),
      );
      callback(list);
    },
    (err) => onError?.(err),
  );
}
