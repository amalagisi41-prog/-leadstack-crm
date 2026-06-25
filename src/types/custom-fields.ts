import type { Timestamp, FieldValue } from "firebase/firestore";

/**
 * Custom fields — operator-defined fields on contacts and deals (Phase 1 of
 * the GHL-migration track). GoHighLevel leans heavily on custom fields, so
 * supporting them is the single biggest fidelity unlock for a migration; it's
 * also broadly useful on its own.
 *
 * Definitions live per-sub-account at `subAccounts/{id}/customFields/{fieldId}`
 * (server-write-only, member-read — same model as `products`). VALUES live
 * inline on each contact/deal doc as a `customFields: { [key]: value }` map,
 * keyed by the definition's stable `key`. Storing values inline keeps reads
 * cheap (no join) and matches how the rest of the app models embedded data.
 */

export type CustomFieldEntity = "contact" | "deal";

/** Supported field types — mirrors GoHighLevel's common set. */
export type CustomFieldType =
  | "text"
  | "number"
  | "date"
  | "dropdown"
  | "multiselect"
  | "checkbox"
  | "url"
  | "phone"
  | "email";

/** A stored custom-field value. Shape depends on the field's type:
 *  - text/url/phone/email/date  → string (date is ISO yyyy-mm-dd)
 *  - number                     → number
 *  - checkbox                   → boolean
 *  - dropdown                   → string (one of options)
 *  - multiselect                → string[] (subset of options)
 *  null = unset. */
export type CustomFieldValue = string | number | boolean | string[] | null;

export interface CustomFieldDef {
  id: string;
  entity: CustomFieldEntity;
  /** Stable machine key (snake_case), unique per (subAccount, entity). The
   *  map key under `contact.customFields` / `deal.customFields`. Immutable. */
  key: string;
  label: string;
  type: CustomFieldType;
  /** Choices for `dropdown` / `multiselect`; empty array for other types. */
  options: string[];
  required: boolean;
  /** Display order in forms (ascending). */
  order: number;

  agencyId: string;
  subAccountId: string;
  createdByUid: string;
  createdAt: Timestamp | FieldValue | null;
  updatedAt: Timestamp | FieldValue | null;
}

/** The editable subset accepted by the create/update API. */
export type CustomFieldDefInput = {
  entity: CustomFieldEntity;
  label: string;
  type: CustomFieldType;
  options?: string[];
  required?: boolean;
  order?: number;
};

/** Types that carry a fixed option list. */
export const CUSTOM_FIELD_OPTION_TYPES: ReadonlySet<CustomFieldType> = new Set([
  "dropdown",
  "multiselect",
]);

/** Human labels for the field-type picker. */
export const CUSTOM_FIELD_TYPE_LABELS: Record<CustomFieldType, string> = {
  text: "Text",
  number: "Number",
  date: "Date",
  dropdown: "Dropdown (single select)",
  multiselect: "Multi-select",
  checkbox: "Checkbox",
  url: "URL",
  phone: "Phone",
  email: "Email",
};

/** Max custom fields per entity per sub-account — generous, but bounded so the
 *  inline value map + forms stay sane. */
export const MAX_CUSTOM_FIELDS_PER_ENTITY = 50;
