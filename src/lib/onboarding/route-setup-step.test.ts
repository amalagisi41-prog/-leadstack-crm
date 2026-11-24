import { describe, expect, it } from "vitest";
import { setupStepForPath, setupStepToPrompt } from "./route-setup-step";
import { computeSetupProgress } from "./setup-progress";
import type { SubAccountDoc } from "@/types/tenancy";

const sub = (extra: Record<string, unknown> = {}) => ({ name: "T", ...extra }) as unknown as SubAccountDoc;

describe("setupStepForPath", () => {
  it("maps pages to the setup step they depend on", () => {
    expect(setupStepForPath("/sa/abc/conversations")).toBe("communications");
    expect(setupStepForPath("/sa/abc/conversations/c1")).toBe("communications");
    expect(setupStepForPath("/sa/abc/social")).toBe("social");
    expect(setupStepForPath("/sa/abc/idx")).toBe("listings");
  });

  it("prefers the more specific settings route over the dashboard", () => {
    expect(setupStepForPath("/sa/abc/dashboard/settings")).toBe("communications");
    expect(setupStepForPath("/sa/abc/dashboard")).toBe("next");
  });

  it("doesn't match look-alike prefixes or unrelated pages", () => {
    expect(setupStepForPath("/sa/abc/socials")).toBeNull();
    expect(setupStepForPath("/sa/abc/tasks")).toBeNull();
  });
});

describe("setupStepToPrompt", () => {
  it("asks the page's own step when it's the one to do", () => {
    const p = computeSetupProgress(sub(), true);
    expect(setupStepToPrompt("/sa/abc/conversations", p)).toBe("communications");
  });

  it("asks the unlocking step when the page's step is still locked", () => {
    const p = computeSetupProgress(sub(), false);
    expect(setupStepToPrompt("/sa/abc/social", p)).toBe("identity");
  });

  it("asks nothing once the page's step is done", () => {
    const p = computeSetupProgress(sub({ googleAccountConfig: { status: "connected" } }), true);
    expect(setupStepToPrompt("/sa/abc/conversations", p)).toBeNull();
    expect(setupStepToPrompt("/sa/abc/dashboard", p)).toBe("listings");
  });
});
