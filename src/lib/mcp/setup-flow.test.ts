import { describe, expect, it } from "vitest";
import { mcpSettingsHint, mcpSetupStepIds } from "./setup-flow";

describe("mcpSetupStepIds", () => {
  it("starts with only the app question", () => {
    expect(mcpSetupStepIds({})).toEqual(["app"]);
  });

  it("runs the full connect path for a known app, ending at a verified first prompt", () => {
    expect(mcpSetupStepIds({ app: "claude" })).toEqual([
      "app",
      "open-settings",
      "copy-address",
      "approve",
      "verify",
      "first-prompt",
    ]);
  });

  it("offers the built-in assistant before any setup when the user is unsure", () => {
    expect(mcpSetupStepIds({ app: "unsure" })).toEqual(["app", "maybe-not-needed"]);
    expect(mcpSetupStepIds({ app: "unsure", "maybe-not-needed": "zack" })).toEqual([
      "app",
      "maybe-not-needed",
      "use-zack",
    ]);
  });

  it("still lets an unsure user continue into setup", () => {
    const ids = mcpSetupStepIds({ app: "unsure", "maybe-not-needed": "continue" });
    expect(ids).toContain("verify");
    expect(ids[ids.length - 1]).toBe("first-prompt");
  });

  it("never reaches the final prompt without a verify step first", () => {
    for (const app of ["claude", "chatgpt", "other"]) {
      const ids = mcpSetupStepIds({ app });
      expect(ids.indexOf("verify")).toBeLessThan(ids.indexOf("first-prompt"));
    }
  });
});

describe("mcpSettingsHint", () => {
  it("names the app the user picked", () => {
    expect(mcpSettingsHint("claude").appName).toBe("Claude");
    expect(mcpSettingsHint("chatgpt").appName).toBe("ChatGPT");
    expect(mcpSettingsHint("other").appName).toBe("your AI app");
  });
});
