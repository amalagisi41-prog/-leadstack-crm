import {
  collection,
  onSnapshot,
  query,
  where,
  type Unsubscribe,
} from "firebase/firestore";
import { getFirebaseDb } from "@/lib/firebase/client";
import type { Product } from "@/types/products";
import type { TenantScope } from "@/types";

/**
 * Client-side subscriptions to the `products` collection.
 *
 * Writes go through the server API (`/api/sub-accounts/[id]/products/...`)
 * — those routes apply sanitization and Admin SDK writes. The browser
 * only needs read access here.
 */

const PRODUCTS = "products";

export function subscribeToProducts(
  scope: TenantScope,
  callback: (products: Product[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const q = query(
    collection(getFirebaseDb(), PRODUCTS),
    where("subAccountId", "==", scope.subAccountId),
  );
  return onSnapshot(
    q,
    (snap) => {
      const products = snap.docs.map(
        (d) => ({ id: d.id, ...(d.data() as Omit<Product, "id">) }),
      );
      // Sort: active first (alphabetical), then archived (alphabetical).
      products.sort((a, b) => {
        if (a.active !== b.active) return a.active ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      callback(products);
    },
    onError,
  );
}
