import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BUILT_IN_ONBOARDING_VIDEOS,
  ONBOARDING_METHOD_STEPS,
  ONBOARDING_STEPS,
  getOnboardingMethodVideoUrl,
  getOnboardingVideoUrl,
} from "./steps";

describe("built-in onboarding videos", () => {
  it("ships a video file for every checklist step", () => {
    for (const step of ONBOARDING_STEPS) {
      const url = BUILT_IN_ONBOARDING_VIDEOS[step.id];
      expect(url, step.id).toMatch(/^\/onboarding-videos\/.+\.mp4$/);
      expect(existsSync(join(process.cwd(), "public", url)), url).toBe(true);
    }
  });

  it("uses the built-in video when the agency hasn't pasted a link", () => {
    expect(getOnboardingVideoUrl("contacts", {})).toBe(BUILT_IN_ONBOARDING_VIDEOS.contacts);
    expect(getOnboardingVideoUrl("contacts", { contacts: "   " })).toBe(BUILT_IN_ONBOARDING_VIDEOS.contacts);
  });

  it("lets an agency link replace the built-in video", () => {
    expect(getOnboardingVideoUrl("contacts", { contacts: "https://loom.com/x" })).toBe("https://loom.com/x");
  });

  it("gives every dashboard method step a Watch video, preferring agency links", () => {
    for (const step of ONBOARDING_METHOD_STEPS) {
      expect(getOnboardingMethodVideoUrl(step, null), step.id).toBeTruthy();
    }
    const connect = ONBOARDING_METHOD_STEPS.find((s) => s.id === "connect")!;
    expect(getOnboardingMethodVideoUrl(connect, { sms: "https://loom.com/sms" })).toBe("https://loom.com/sms");
  });
});
