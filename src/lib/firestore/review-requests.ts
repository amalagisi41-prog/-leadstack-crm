import {
  collection,
  onSnapshot,
  query,
  where,
  type Unsubscribe,
} from "firebase/firestore";
import { getFirebaseDb } from "@/lib/firebase/client";
import type { ReviewRequestDoc } from "@/types/review-requests";

function millis(v: unknown): number {
  const t = v as { toMillis?: () => number } | null;
  return t && typeof t.toMillis === "function" ? t.toMillis() : 0;
}

/**
 * Live Review Requests log for one workspace, newest first. Read-only for
 * members; every write goes through lib/reviews/log.ts. Single equality
 * filter (no composite index); sorted client-side.
 */
export function subscribeToReviewRequests(
  subAccountId: string,
  callback: (rows: ReviewRequestDoc[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const q = query(
    collection(getFirebaseDb(), "reviewRequests"),
    where("subAccountId", "==", subAccountId),
  );
  return onSnapshot(
    q,
    (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ReviewRequestDoc, "id">) }));
      rows.sort((a, b) => millis(b.createdAt) - millis(a.createdAt));
      callback(rows);
    },
    (err) => onError?.(err),
  );
}
