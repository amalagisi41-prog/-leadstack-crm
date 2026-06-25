import {
  collection,
  onSnapshot,
  type Unsubscribe,
} from "firebase/firestore";
import { getFirebaseDb } from "@/lib/firebase/client";
import type { GroupMembership, Member, Purchase } from "@/types/community";

/** Staff roster reads (client SDK; rules allow member-scoped staff reads). */

export function subscribeToMembers(
  saId: string,
  cb: (members: Member[]) => void,
  onError?: (e: Error) => void,
): Unsubscribe {
  return onSnapshot(
    collection(getFirebaseDb(), `subAccounts/${saId}/members`),
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Member, "id">) }))),
    (e) => onError?.(e),
  );
}

export function subscribeToMemberships(
  saId: string,
  groupId: string,
  cb: (memberships: GroupMembership[]) => void,
  onError?: (e: Error) => void,
): Unsubscribe {
  return onSnapshot(
    collection(
      getFirebaseDb(),
      `subAccounts/${saId}/communityGroups/${groupId}/memberships`,
    ),
    (snap) =>
      cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<GroupMembership, "id">) }))),
    (e) => onError?.(e),
  );
}

export function subscribeToPurchases(
  saId: string,
  groupId: string,
  cb: (purchases: Purchase[]) => void,
  onError?: (e: Error) => void,
): Unsubscribe {
  return onSnapshot(
    collection(
      getFirebaseDb(),
      `subAccounts/${saId}/communityGroups/${groupId}/purchases`,
    ),
    (snap) =>
      cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Purchase, "id">) }))),
    (e) => onError?.(e),
  );
}
