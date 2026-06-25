import "server-only";

import { getAdminDb } from "@/lib/firebase/admin";
import type { AgencyDoc } from "@/types";

/**
 * Agency-level messaging policy. Today: whether sub-accounts may use the shared
 * (deployment-wide, env-var) Twilio sender, or must bring their own dedicated
 * number. Read on every SMS send + on the workflow builder readiness check, so
 * results are cached briefly per agency to avoid a Firestore read per send.
 */

const TTL_MS = 60 * 1000;
const cache = new Map<string, { at: number; allowed: boolean }>();

/**
 * True when sub-accounts of this agency are allowed to fall back to the shared
 * SMS sender. Defaults to TRUE (legacy/undefined reads as allowed). A missing
 * agencyId also returns true so transactional/platform sends never break.
 */
export async function agencyAllowsSharedSms(
  agencyId: string | null | undefined,
): Promise<boolean> {
  if (!agencyId) return true;

  const hit = cache.get(agencyId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.allowed;

  let allowed = true;
  try {
    const snap = await getAdminDb().doc(`agencies/${agencyId}`).get();
    const data = snap.data() as Pick<AgencyDoc, "sharedSmsAllowed"> | undefined;
    // Only an explicit `false` disables the shared fallback.
    allowed = data?.sharedSmsAllowed !== false;
  } catch {
    // On a read error, fail OPEN — don't silently block legitimate sends.
    allowed = true;
  }

  cache.set(agencyId, { at: Date.now(), allowed });
  return allowed;
}

/** Drop the cached policy for an agency after the owner toggles it. */
export function invalidateAgencyPolicyCache(agencyId: string): void {
  cache.delete(agencyId);
}
