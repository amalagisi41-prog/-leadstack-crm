import type { FieldValue, Timestamp } from "firebase-admin/firestore";

export const PROPERTY_SHARED_TEMPLATE = "shared-listing" as const;
export const PROPERTY_LISTING_TEMPLATE_FILE = "single-cpg_listing.php" as const;

export interface PropertyMediaPackageDoc {
  listingId: string;
  subAccountId: string;
  templateId: typeof PROPERTY_SHARED_TEMPLATE;
  /** Canonical WordPress template used for every new listing page. */
  listingTemplateFile: typeof PROPERTY_LISTING_TEMPLATE_FILE;
  /** The same shared WordPress template is used for the optional brochure. */
  brochureTemplateFile: typeof PROPERTY_LISTING_TEMPLATE_FILE;
  activeFolder: string;
  archiveFolder: string;
  activeVersionId: string;
  brochureUrl: string | null;
  photoCount: number;
  sourceName: string;
  createdByUid: string;
  createdAt: Timestamp | FieldValue | null;
  updatedAt: Timestamp | FieldValue | null;
}
