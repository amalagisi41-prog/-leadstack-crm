import {
  collection,
  onSnapshot,
  query,
  where,
  type Unsubscribe,
} from "firebase/firestore";
import { getFirebaseDb } from "@/lib/firebase/client";
import type { CustomFieldDef, CustomFieldEntity } from "@/types/custom-fields";

/**
 * Subscribe to a sub-account's custom-field definitions for one entity
 * (contact or deal). Drives the Settings manager + (Phase 1b) the value
 * inputs on the contact/deal forms. Writes go through the Admin-SDK routes;
 * definitions are read-only for members at the rules level.
 */
export function subscribeToCustomFields(
  subAccountId: string,
  entity: CustomFieldEntity,
  callback: (fields: CustomFieldDef[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const q = query(
    collection(getFirebaseDb(), "subAccounts", subAccountId, "customFields"),
    where("entity", "==", entity),
  );
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map(
        (d) => ({ id: d.id, ...(d.data() as Omit<CustomFieldDef, "id">) }),
      );
      list.sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));
      callback(list);
    },
    (err) => onError?.(err),
  );
}
