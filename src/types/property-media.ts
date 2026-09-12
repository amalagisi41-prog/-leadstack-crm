import type { FieldValue, Timestamp } from "firebase-admin/firestore";

export const PROPERTY_BROCHURE_TEMPLATE = "1076-westover-road" as const;
export const PROPERTY_LISTING_TEMPLATE_FILE = "single-cpg_listing.php" as const;
export const PROPERTY_BROCHURE_TEMPLATE_FILE = "single-1076-westover.php" as const;

export interface PropertyMediaPackageDoc {
  listingId: string;
  subAccountId: string;
  templateId: typeof PROPERTY_BROCHURE_TEMPLATE;
  /** Canonical WordPress template used for every new listing page. */
  listingTemplateFile: typeof PROPERTY_LISTING_TEMPLATE_FILE;
  /** Optional WordPress template used as the one-page brochure reference. */
  brochureTemplateFile: typeof PROPERTY_BROCHURE_TEMPLATE_FILE;
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
