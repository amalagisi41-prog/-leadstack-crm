export type McpAiApp = "claude" | "chatgpt" | "other" | "unsure";

export type McpSetupStepId =
  | "app"
  | "maybe-not-needed"
  | "open-settings"
  | "copy-address"
  | "approve"
  | "verify"
  | "first-prompt"
  | "use-zack";

/**
 * Which screens the MCP guided setup shows for a given set of answers.
 * "Not sure" doesn't push a realtor through a developer integration they
 * likely don't need — it explains the built-in assistant and lets them
 * choose to carry on anyway.
 */
export function mcpSetupStepIds(answers: Record<string, string>): McpSetupStepId[] {
  const app = answers.app as McpAiApp | undefined;
  if (!app) return ["app"];
  const connectSteps: McpSetupStepId[] = [
    "open-settings",
    "copy-address",
    "approve",
    "verify",
    "first-prompt",
  ];
  if (app === "unsure") {
    const choice = answers["maybe-not-needed"];
    if (choice === "zack") return ["app", "maybe-not-needed", "use-zack"];
    if (choice === "continue") return ["app", "maybe-not-needed", ...connectSteps];
    return ["app", "maybe-not-needed"];
  }
  return ["app", ...connectSteps];
}

/** Where to add a custom connector, worded for each app. */
export function mcpSettingsHint(app: McpAiApp): { appName: string; steps: string[] } {
  switch (app) {
    case "claude":
      return {
        appName: "Claude",
        steps: [
          "Open Claude (claude.ai or the desktop app) and sign in.",
          "Go to Settings → Connectors.",
          "Choose “Add custom connector”.",
        ],
      };
    case "chatgpt":
      return {
        appName: "ChatGPT",
        steps: [
          "Open ChatGPT and sign in.",
          "Go to Settings → Apps & Connectors (the name can vary by plan).",
          "Look for the option to add a custom connector or MCP server.",
        ],
      };
    default:
      return {
        appName: "your AI app",
        steps: [
          "Open your AI app's settings.",
          "Look for “Connectors”, “Integrations”, “Tools”, or “MCP servers”.",
          "Choose the option to add a custom or remote server.",
        ],
      };
  }
}
