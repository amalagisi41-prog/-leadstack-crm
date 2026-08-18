import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import type { AiCompletionResult } from "./openrouter";

/**
 * What each workspace costs us in model spend.
 *
 * The conversational channels already meter themselves — `incrementChannelTokens`
 * has counted SMS, voice and web-chat replies onto the channel doc since they
 * were built. Everything else did not, including the single most expensive call
 * in the product: the Business Blueprint import, at 1,800 output tokens against
 * a page of scraped text.
 *
 * That gap is not an accounting nicety. The model spend sits on one shared
 * prepaid balance, so without per-workspace attribution there is no way to tell
 * a healthy month from one workspace hammering a loop, no way to price a tier
 * against real numbers, and no warning before the balance empties and every AI
 * feature stops for every tenant at once — which is exactly how this got found.
 *
 * Written to `aiUsage/{YYYY-MM}/scopes/{scopeId}` so one collection read answers
 * "what did this month cost, and who spent it".
 */

/** Every non-channel place the product spends tokens. */
export type AiFeature =
  | "blueprint_import"
  | "website_designer"
  | "assistant"
  | "onboarding_help"
  | "persona"
  | "field_assist"
  | "business_setup"
  | "agent_test";

/**
 * USD per million tokens, [input, output].
 *
 * OpenRouter bills at provider rates and takes its cut on credit purchase
 * rather than per call, so these are the provider list prices — treat the
 * result as an estimate of the balance drawn down, not an invoice.
 */
const PRICE_PER_MTOK: Record<string, [number, number]> = {
  "claude-haiku-4.5": [1, 5],
  "claude-haiku-4-5": [1, 5],
  "claude-sonnet-4-6": [3, 15],
  "claude-sonnet-5": [3, 15],
  "claude-opus-4-6": [5, 25],
  "claude-opus-4-7": [5, 25],
  "claude-opus-4-8": [5, 25],
  "claude-opus-5": [5, 25],
  "claude-fable-5": [10, 50],
};

/**
 * An unrecognised model is priced at the Opus tier rather than the cheapest.
 *
 * A spend estimate that is too low is the dangerous direction: it reads as
 * headroom that is not there. Over-estimating an unknown model shows up as a
 * conservative number, which is the harmless mistake.
 */
const FALLBACK_PRICE: [number, number] = [5, 25];

/** OpenRouter returns ids like `anthropic/claude-haiku-4.5:beta`. */
export function normaliseModelId(model: string): string {
  return model.trim().toLowerCase().split("/").pop()!.split(":")[0];
}

export function estimateCostUsd(
  promptTokens: number,
  completionTokens: number,
  model: string
): number {
  const [inPrice, outPrice] =
    PRICE_PER_MTOK[normaliseModelId(model)] ?? FALLBACK_PRICE;
  return (
    (promptTokens / 1_000_000) * inPrice +
    (completionTokens / 1_000_000) * outPrice
  );
}

/** Billing period key. UTC, so a month boundary means the same thing everywhere. */
export function usagePeriod(at: Date = new Date()): string {
  return `${at.getUTCFullYear()}-${String(at.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Untenanted spend — onboarding help runs before a workspace is chosen. */
export const PLATFORM_SCOPE = "platform";

/**
 * Record one completion against a workspace.
 *
 * Never throws and never blocks: metering that can break the feature it
 * measures is worse than no metering. Callers fire it with `void`.
 */
export async function recordAiUsage({
  subAccountId,
  feature,
  completion,
  at,
}: {
  /** Null for spend that belongs to no single workspace. */
  subAccountId: string | null;
  feature: AiFeature;
  completion: Pick<
    AiCompletionResult,
    "promptTokens" | "completionTokens" | "totalTokens" | "model"
  >;
  at?: Date;
}): Promise<void> {
  try {
    const { promptTokens, completionTokens, totalTokens, model } = completion;
    if (totalTokens <= 0 && promptTokens <= 0 && completionTokens <= 0) return;

    const costUsd = estimateCostUsd(promptTokens, completionTokens, model);
    const period = usagePeriod(at);
    const scope = subAccountId ?? PLATFORM_SCOPE;

    await getAdminDb()
      .doc(`aiUsage/${period}/scopes/${scope}`)
      .set(
        {
          subAccountId,
          period,
          calls: FieldValue.increment(1),
          promptTokens: FieldValue.increment(promptTokens),
          completionTokens: FieldValue.increment(completionTokens),
          totalTokens: FieldValue.increment(totalTokens),
          costUsd: FieldValue.increment(costUsd),
          byFeature: {
            [feature]: {
              calls: FieldValue.increment(1),
              totalTokens: FieldValue.increment(totalTokens),
              costUsd: FieldValue.increment(costUsd),
            },
          },
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
  } catch (error) {
    // Losing a usage row costs us a line in a report. Throwing here would cost
    // the operator the feature they were actually using.
    console.error("recordAiUsage failed", error);
  }
}
