import { describe, expect, it } from "vitest";
import {
  isLaunchPriority,
  isRealtorRole,
  LAUNCH_PRIORITIES,
  REALTOR_ROLES,
} from "./onboarding-answers";

/**
 * These guards are what stands between the wizard's answers and the
 * sub-account document. They were the missing piece: the wizard sent both
 * answers and the API dropped them, so nothing validated or stored anything.
 */

describe("onboarding answer guards", () => {
  it("accepts every role the wizard can produce", () => {
    for (const role of REALTOR_ROLES) {
      expect(isRealtorRole(role), role).toBe(true);
    }
  });

  it("accepts every priority the wizard can produce", () => {
    for (const priority of LAUNCH_PRIORITIES) {
      expect(isLaunchPriority(priority), priority).toBe(true);
    }
  });

  it("rejects anything that isn't a known answer", () => {
    for (const bad of [
      undefined,
      null,
      "",
      "SOLO_AGENT",
      "realtor",
      42,
      {},
      ["solo_agent"],
    ]) {
      expect(isRealtorRole(bad)).toBe(false);
      expect(isLaunchPriority(bad)).toBe(false);
    }
  });

  it("keeps the two answer sets distinct", () => {
    // A role is not a priority and vice versa — mixing them would silently
    // store a nonsense answer that later screens would derive from.
    for (const role of REALTOR_ROLES) {
      expect(isLaunchPriority(role)).toBe(false);
    }
    for (const priority of LAUNCH_PRIORITIES) {
      expect(isRealtorRole(priority)).toBe(false);
    }
  });
});
