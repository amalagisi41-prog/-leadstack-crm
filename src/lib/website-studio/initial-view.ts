export type WebsiteStudioView = "builder" | "vibe" | "setup";
export type WebsiteStudioWorkspace = "home" | "vibe";

export function getInitialWebsiteStudioView({
  foundationReady,
  hasTemplateSite,
}: {
  foundationReady: boolean;
  hasTemplateSite: boolean;
}): WebsiteStudioView {
  // Drafting is available immediately. Domain and hosting readiness is a
  // publish gate, not a design gate.
  void foundationReady;
  return hasTemplateSite ? "vibe" : "builder";
}

export function getWorkspaceWebsiteStudioView({
  workspace,
  foundationReady,
  hasTemplateSite,
}: {
  workspace: WebsiteStudioWorkspace;
  foundationReady: boolean;
  hasTemplateSite: boolean;
}): WebsiteStudioView {
  if (workspace === "vibe") return "vibe";
  return getInitialWebsiteStudioView({ foundationReady, hasTemplateSite });
}
