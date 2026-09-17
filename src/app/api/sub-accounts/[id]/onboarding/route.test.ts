import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * The onboarding PATCH is the one write that first-run setup depends on, and
 * it had two problems this file pins down:
 *
 *   1. It read only `steps` and `wizardCompleted`. The wizard sent
 *      `realtorRole` and `launchPriority` on every finish and both were
 *      silently discarded, so setup could never adapt to what it had asked.
 *
 *   2. It wrote `onboardingStepsCompleted` unconditionally. Saving an answer
 *      mid-wizard therefore meant sending a `steps` array, and sending an
 *      empty one would have wiped every completed step. `steps` is now
 *      optional and an answers-only PATCH must leave the checklist alone.
 */

const updates: Array<Record<string, unknown>> = [];
let storedDoc: Record<string, unknown> = {};

vi.mock("firebase-admin/firestore", () => ({
  FieldValue: { serverTimestamp: () => "SERVER_TS" },
}));

vi.mock("@/lib/firebase/admin", () => ({
  getAdminDb: () => ({
    doc: () => ({
      get: async () => ({ exists: true, data: () => storedDoc }),
      update: async (data: Record<string, unknown>) => {
        updates.push(data);
      },
    }),
  }),
}));

vi.mock("@/lib/auth/require-tenancy", () => ({
  requireSubAccountMember: async () => ({
    uid: "user-1",
    agencyId: "agency-1",
    subAccountId: "sub-1",
    subAccountRole: "admin",
  }),
}));

const queueOnboardingLifecycleSequence = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/onboarding/lifecycle-email", () => ({
  queueOnboardingLifecycleSequence: (...args: unknown[]) =>
    queueOnboardingLifecycleSequence(...args),
}));

import { PATCH } from "./route";

function patch(body: unknown) {
  return PATCH(
    new Request("https://example.test/api/sub-accounts/sub-1/onboarding", {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: "sub-1" }) },
  );
}

beforeEach(() => {
  updates.length = 0;
  storedDoc = {};
  queueOnboardingLifecycleSequence.mockClear();
});

describe("onboarding PATCH — the answers it used to throw away", () => {
  it("persists the role the wizard asked for", async () => {
    const res = await patch({ realtorRole: "solo_agent" });
    expect(res.status).toBe(200);
    expect(updates[0]).toMatchObject({ realtorRole: "solo_agent" });
  });

  it("persists the priority the wizard asked for", async () => {
    await patch({ launchPriority: "get_leads" });
    expect(updates[0]).toMatchObject({ launchPriority: "get_leads" });
  });

  it("ignores an unrecognised answer instead of failing the request", async () => {
    // A stale client sending a retired option must never block setup.
    const res = await patch({ realtorRole: "astronaut", launchPriority: "x" });
    expect(res.status).toBe(200);
    expect(updates[0]).not.toHaveProperty("realtorRole");
    expect(updates[0]).not.toHaveProperty("launchPriority");
  });
});

describe("onboarding PATCH — answers must not clobber the checklist", () => {
  it("leaves onboardingStepsCompleted untouched when no steps are sent", async () => {
    await patch({ realtorRole: "team_lead" });
    expect(updates[0]).not.toHaveProperty("onboardingStepsCompleted");
  });

  it("does not re-queue lifecycle email on an answers-only save", async () => {
    await patch({ realtorRole: "team_lead" });
    expect(queueOnboardingLifecycleSequence).not.toHaveBeenCalled();
  });

  it("still writes the checklist when steps ARE sent", async () => {
    await patch({ steps: ["business_profile"] });
    expect(updates[0]).toMatchObject({
      onboardingStepsCompleted: ["business_profile"],
    });
  });

  it("drops unknown step ids", async () => {
    await patch({ steps: ["business_profile", "not_a_real_step"] });
    expect(updates[0].onboardingStepsCompleted).toEqual(["business_profile"]);
  });

  it("still rejects a steps value that isn't an array", async () => {
    const res = await patch({ steps: "business_profile" });
    expect(res.status).toBe(400);
  });

  it("records wizard completion alongside the answers", async () => {
    await patch({
      steps: [],
      wizardCompleted: true,
      realtorRole: "brokerage",
      launchPriority: "build_website",
    });
    expect(updates[0]).toMatchObject({
      onboardingWizardCompletedAt: "SERVER_TS",
      realtorRole: "brokerage",
      launchPriority: "build_website",
    });
  });
});
