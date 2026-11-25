import { describe, expect, it } from "vitest";
import { AGENTSTACK_METHOD_STEP_NAMES } from "@/config/landing";
import { computeMethodProgress, METHOD_STEPS, nextActionLabel, setupBadgeText, type MethodInputs } from "./method";

const none: MethodInputs = {
  setupDone: { identity: false, communications: false, listings: false, social: false, domain: false },
  skipped: [],
  checklistDone: [],
};

describe("The AgentStack Method model", () => {
  it("carries the marketing site's six steps, in the same order", () => {
    expect(METHOD_STEPS.map((s) => s.name)).toEqual([...AGENTSTACK_METHOD_STEP_NAMES]);
    expect(METHOD_STEPS.map((s) => s.name)).toEqual(["Build", "Connect", "Capture", "Respond", "Nurture", "Close"]);
  });

  it("maps every existing setup task under exactly one step", () => {
    const ids = METHOD_STEPS.flatMap((s) => s.tasks.map((t) => t.id));
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ["identity", "communications", "listings", "social", "domain"]) expect(ids).toContain(id);
    for (const id of ["business_profile", "contacts", "sms", "form", "automation", "booking", "pipeline", "ai", "lseo"]) {
      expect(ids).toContain(id);
    }
  });

  it("starts at 0 of 6 with every step not started and Build next", () => {
    const p = computeMethodProgress(none);
    expect(p.total).toBe(6);
    expect(p.completedCount).toBe(0);
    expect(p.percent).toBe(0);
    expect(p.steps.every((s) => s.status === "not_started")).toBe(true);
    expect(nextActionLabel(p)).toBe("Build · Add your business details");
  });

  it("marks a step in progress when some of its tasks are done", () => {
    const p = computeMethodProgress({ ...none, setupDone: { ...none.setupDone, identity: true } });
    expect(p.steps[0].status).toBe("in_progress");
    expect(p.completedCount).toBe(0);
  });

  it("counts a step complete only when its required tasks are done or skipped", () => {
    const p = computeMethodProgress({
      setupDone: { identity: true, communications: true, listings: false, social: false, domain: false },
      skipped: ["listings", "social"],
      checklistDone: ["business_profile", "contacts"],
    });
    expect(p.steps.map((s) => s.status)).toEqual([
      "complete",
      "complete",
      "not_started",
      "not_started",
      "not_started",
      "not_started",
    ]);
    expect(p.completedCount).toBe(2);
    expect(p.percent).toBe(33);
    expect(p.nextStep?.name).toBe("Capture");
  });

  it("does not count an all-optional step (Nurture) as complete before anything is done", () => {
    const p = computeMethodProgress(none);
    expect(p.steps.find((s) => s.id === "nurture")?.status).toBe("not_started");
    const started = computeMethodProgress({ ...none, checklistDone: ["sms"] });
    expect(started.steps.find((s) => s.id === "nurture")?.status).toBe("complete");
  });

  it("reaches 6 of 6 / 100% and hides the badge when everything is done", () => {
    const p = computeMethodProgress({
      setupDone: { identity: true, communications: true, listings: true, social: true, domain: true },
      skipped: [],
      checklistDone: ["business_profile", "contacts", "form", "automation", "ai", "sms", "lseo", "booking", "pipeline"],
    });
    expect(p.complete).toBe(true);
    expect(p.percent).toBe(100);
    expect(setupBadgeText(p)).toBeNull();
  });

  it("gives the sidebar badge the same count as the progress", () => {
    const p = computeMethodProgress({ ...none, setupDone: { ...none.setupDone, identity: true }, checklistDone: ["business_profile"] });
    expect(setupBadgeText(p)).toBe(`${p.completedCount}/${p.total}`);
    expect(setupBadgeText(p)).toBe("1/6");
  });
});
