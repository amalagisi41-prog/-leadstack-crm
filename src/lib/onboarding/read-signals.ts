import "server-only";

import type { Firestore } from "firebase-admin/firestore";
import { businessProfileCompleteness } from "@/lib/business-profile/compile";
import {
  EMPTY_ONBOARDING_SIGNALS,
  ownRecordCount,
  type OnboardingSignals,
} from "./completion";
import type { BusinessProfileContent } from "@/types/business-profile";
import type { OnboardingFoundation } from "@/types/onboarding-foundation";
import type { SubAccountDoc } from "@/types/tenancy";

/**
 * Read what a workspace actually contains, so onboarding progress can be
 * derived rather than taken on trust. See `completion.ts` for why.
 *
 * Counts use Firestore aggregation, so the cost is one small read per
 * collection regardless of how many contacts or deals a workspace holds — this
 * runs on a dashboard load.
 *
 * Best-effort by design: a failed read yields the "not done" signal rather
 * than throwing. Claiming a step is finished because a query errored would be
 * the precise failure this module exists to prevent, and the opposite mistake
 * (showing outstanding work that is actually done) is recoverable by reloading.
 */
export async function readOnboardingSignals(
  db: Firestore,
  subAccountId: string
): Promise<OnboardingSignals> {
  const countOf = async (
    build: () => FirebaseFirestore.Query | FirebaseFirestore.CollectionReference
    // null means the read FAILED, which is not the same as counting zero.
    // Callers decide which way to err; conflating the two is how a failed
    // query turns into a claim.
  ): Promise<number | null> => {
    try {
      const snap = await build().count().get();
      return snap.data().count;
    } catch {
      return null;
    }
  };
  const docData = async <T>(path: string): Promise<T | null> => {
    try {
      const snap = await db.doc(path).get();
      return snap.exists ? (snap.data() as T) : null;
    } catch {
      return null;
    }
  };

  const scoped = (collection: string) =>
    db.collection(collection).where("subAccountId", "==", subAccountId);

  /**
   * Records the CLIENT created, excluding the worked example every workspace
   * is seeded with.
   *
   * Counted as total minus samples rather than with a "not sample" filter,
   * because Firestore inequality queries skip documents missing the field —
   * and every record predating the sample feature is missing it. Subtracting
   * keeps those counted.
   *
   * If EITHER read fails, this reports zero rather than guessing. Returning
   * the total when the sample count is unavailable — which is what happens if
   * the composite index is missing — would count the seeded example as the
   * client's own work and tell every new workspace it had already imported
   * contacts and built a pipeline. Reporting zero errs the other way: a client
   * is shown work they have in fact done, which they can see is wrong and
   * which a reload fixes. Only one of those two errors is a false "you're
   * done", and it is never the one to take.
   */
  const ownCountOf = async (collection: string): Promise<number> => {
    const [total, samples] = await Promise.all([
      countOf(() => scoped(collection)),
      countOf(() => scoped(collection).where("isSample", "==", true)),
    ]);
    return ownRecordCount(total, samples);
  };

  const [
    sub,
    profile,
    aiProfile,
    aiSms,
    aiWebChat,
    contactCount,
    formCount,
    workflowCount,
    dealCount,
    bookingPageCount,
    campaignBriefCount,
  ] = await Promise.all([
    docData<SubAccountDoc>(`subAccounts/${subAccountId}`),
    docData<BusinessProfileContent>(
      `subAccounts/${subAccountId}/businessProfile/main`
    ),
    docData<{ systemPrompt?: string }>(
      `subAccounts/${subAccountId}/aiAgent/profile`
    ),
    docData<{ enabled?: boolean }>(`subAccounts/${subAccountId}/aiAgent/sms`),
    docData<{ enabled?: boolean }>(
      `subAccounts/${subAccountId}/aiAgent/web-chat`
    ),
    ownCountOf("contacts"),
    countOf(() => scoped("forms")),
    countOf(() => scoped("workflows")),
    ownCountOf("deals"),
    countOf(() => db.collection(`subAccounts/${subAccountId}/bookingPages`)),
    countOf(() => db.collection(`subAccounts/${subAccountId}/campaignBriefs`)),
  ]);

  const foundation = (sub as { onboardingFoundation?: OnboardingFoundation })
    ?.onboardingFoundation;

  return {
    ...EMPTY_ONBOARDING_SIGNALS,
    businessProfileCompletionPct: profile
      ? businessProfileCompleteness(profile)
      : 0,
    contactCount,
    dealCount,
    // A failed read counts as zero here, showing the step as still to do.
    // That is the safe direction: the other one tells a client they finished
    // work they never started.
    formCount: formCount ?? 0,
    workflowCount: workflowCount ?? 0,
    bookingPageCount: bookingPageCount ?? 0,
    campaignBriefCount: campaignBriefCount ?? 0,
    smsConnected: sub?.twilioConfig?.enabled === true,
    aiPersonaSet: !!aiProfile?.systemPrompt?.trim(),
    aiChannelEnabled: aiSms?.enabled === true || aiWebChat?.enabled === true,
    // "live" only. The other states exist precisely because a DNS check that
    // cannot confirm something must not read as success.
    customDomainLive: sub?.customDomainState === "live",
    // The operator named the host of the site they are keeping, and saved it.
    externalHostRecorded:
      !!foundation?.sourcePlatform && !!foundation.completed,
  };
}
