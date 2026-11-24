import { describe, expect, it } from "vitest";
import { commsFlowStepIds, socialFlowStepIds } from "./guided-setup-flows";
import { computeSetupProgress } from "./setup-progress";
import type { SubAccountDoc } from "@/types/tenancy";

describe("commsFlowStepIds", () => {
  it("goes straight to the matching sign-in for a known provider", () => {
    expect(commsFlowStepIds({ provider: "google" })).toEqual(["provider", "google-connect"]);
    expect(commsFlowStepIds({ provider: "outlook" })).toEqual(["provider", "outlook-connect"]);
  });

  it("asks which email they use when unsure, then routes there", () => {
    expect(commsFlowStepIds({ provider: "unsure" })).toEqual(["provider", "which-email"]);
    expect(commsFlowStepIds({ provider: "unsure", "which-email": "gmail" })).toEqual([
      "provider",
      "which-email",
      "google-connect",
    ]);
  });

  it("only shows the Twilio form to someone who already has Twilio", () => {
    expect(commsFlowStepIds({ provider: "phone", "has-twilio": "yes" })).toEqual([
      "provider",
      "has-twilio",
      "twilio-form",
    ]);
  });

  it("steers someone without Twilio back to email instead of a dead end", () => {
    expect(
      commsFlowStepIds({ provider: "phone", "has-twilio": "no", "no-twilio": "outlook" }),
    ).toEqual(["provider", "has-twilio", "no-twilio", "outlook-connect"]);
    expect(
      commsFlowStepIds({ provider: "phone", "has-twilio": "no", "no-twilio": "later" }),
    ).toEqual(["provider", "has-twilio", "no-twilio", "later"]);
  });
});

describe("socialFlowStepIds", () => {
  it("explains the agency gate instead of offering a connect that would fail", () => {
    expect(socialFlowStepIds({}, false)).toEqual(["gate-off"]);
  });

  it("sends someone without a Page to create one before connecting", () => {
    expect(socialFlowStepIds({ "has-page": "no", "has-instagram": "business" }, true)).toEqual([
      "has-page",
      "create-page",
      "has-instagram",
      "connect",
    ]);
  });

  it("adds the Instagram switch step for a personal account", () => {
    expect(socialFlowStepIds({ "has-page": "yes", "has-instagram": "personal" }, true)).toEqual([
      "has-page",
      "has-instagram",
      "switch-ig",
      "connect",
    ]);
  });

  it("lets the realtor skip", () => {
    expect(socialFlowStepIds({ "has-page": "skip" }, true)).toEqual(["has-page", "skip"]);
  });
});

describe("computeSetupProgress", () => {
  const base = { name: "Test" } as SubAccountDoc;

  it("starts at identity with nothing done", () => {
    const p = computeSetupProgress(base, false);
    expect(p.satisfiedCount).toBe(0);
    expect(p.nextStep).toBe("identity");
    expect(p.complete).toBe(false);
  });

  it("moves to communications once identity is saved", () => {
    expect(computeSetupProgress(base, true).nextStep).toBe("communications");
  });

  it("counts a skip as satisfied but never a skip of a mandatory step", () => {
    const sub = {
      ...base,
      googleAccountConfig: { status: "connected" },
      setupSkippedSteps: ["listings", "social", "payments", "domain", "communications"],
    } as unknown as SubAccountDoc;
    expect(computeSetupProgress(sub, true).complete).toBe(true);
    expect(computeSetupProgress({ ...sub, googleAccountConfig: undefined } as SubAccountDoc, true).complete).toBe(false);
  });
});
