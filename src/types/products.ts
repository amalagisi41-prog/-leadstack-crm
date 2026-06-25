import type { Timestamp, FieldValue } from "firebase/firestore";

/**
 * Product catalog — per sub-account, reusable across quotes and invoices.
 *
 * Tenancy mirrors quotes / contacts: every doc carries `agencyId` +
 * `subAccountId` keys so Firestore rules can gate by sub-account
 * membership.
 *
 * Money is stored as integer cents to avoid floating-point arithmetic.
 * When dropped into a quote/invoice line item, the cents value is
 * converted to whole units (line items use whole units for back-compat
 * with the existing quote schema). The product's name + description +
 * unit price are SNAPSHOTTED onto the line item at the moment of add —
 * editing the product later never mutates historical docs.
 *
 * Archive = soft delete. `active: false` hides the product from the
 * catalog picker but historical line items keep their snapshotted
 * values unchanged. Operator can restore by setting active back to true.
 */

export interface Product {
  id: string;

  // ── Tenancy ───────────────────────────────────────────────────────
  agencyId: string;
  subAccountId: string;
  createdByUid: string;

  // ── Catalog fields ───────────────────────────────────────────────
  name: string;
  description: string;
  /** Integer cents in the product's currency. */
  unitPriceCents: number;
  /** ISO 4217. Defaults to "USD". */
  currency: string;
  /** False = archived. Hidden from picker; doesn't affect historical
   *  line items that snapshotted this product earlier. */
  active: boolean;

  // ── Audit ────────────────────────────────────────────────────────
  createdAt: Timestamp | FieldValue | null;
  updatedAt: Timestamp | FieldValue | null;
}

export const DEFAULT_PRODUCT: Omit<
  Product,
  "id" | "agencyId" | "subAccountId" | "createdByUid" | "createdAt" | "updatedAt"
> = {
  name: "",
  description: "",
  unitPriceCents: 0,
  currency: "USD",
  active: true,
};
