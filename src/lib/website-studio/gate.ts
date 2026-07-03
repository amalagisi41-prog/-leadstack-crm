import "server-only";

import { getAdminDb } from "@/lib/firebase/admin";

/**
 * Website Studio is a paid add-on gated by the agency owner per sub-account
 * (`subAccounts/{id}.websiteStudioEnabledByAgency`). Consumer routes call
 * this after auth and 403 when it returns false. Reads `=== true` so legacy
 * docs missing the field stay locked.
 */
export async function websiteStudioGateOpen(subAccountId: string): Promise<boolean> {
  const snap = await getAdminDb().doc(`subAccounts/${subAccountId}`).get();
  return snap.data()?.websiteStudioEnabledByAgency === true;
}

export const WEBSITE_STUDIO_LOCKED_MESSAGE =
  "Website Studio is a premium add-on. Ask your agency to enable it for your account.";
