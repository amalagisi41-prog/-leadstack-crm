import "server-only";

import { getAdminDb } from "@/lib/firebase/admin";
import type { CustomFieldDef, CustomFieldEntity } from "@/types/custom-fields";

/**
 * Load a sub-account's custom-field definitions for one entity (server-side,
 * Admin SDK). Used by the create/update routes to validate incoming value
 * maps against the live definitions (and later by the GHL importer).
 */
export async function loadCustomFieldDefs(
  subAccountId: string,
  entity: CustomFieldEntity,
): Promise<CustomFieldDef[]> {
  const snap = await getAdminDb()
    .collection(`subAccounts/${subAccountId}/customFields`)
    .where("entity", "==", entity)
    .get();
  return snap.docs.map(
    (d) => ({ id: d.id, ...(d.data() as Omit<CustomFieldDef, "id">) }),
  );
}
