import "server-only";

import type { Firestore } from "firebase-admin/firestore";
import { businessProfileCompleteness } from "@/lib/business-profile/compile";
import { EMPTY_ONBOARDING_SIGNALS, type OnboardingSignals } from "./completion";
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
  ): Promise<number> => {
    try {
      const snap = await build().count().get();
      return snap.data().count;
    } catch {
      return 0;
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
    countOf(() => scoped("contacts")),
    countOf(() => scoped("forms")),
    countOf(() => scoped("workflows")),
    countOf(() => scoped("deals")),
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
    formCount,
    workflowCount,
    dealCount,
    bookingPageCount,
    campaignBriefCount,
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
