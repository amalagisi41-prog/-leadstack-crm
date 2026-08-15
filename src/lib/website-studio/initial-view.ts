export type WebsiteStudioView = "builder" | "vibe" | "setup";
export type WebsiteStudioWorkspace = "home" | "vibe";

// The live-site baseline approval flow was retired (Website Studio 2.0,
// Phase 1). The Studio never routes through an "exact" review view anymore:
// Vibe unlocks as soon as the domain/hosting foundation is confirmed.
export function getInitialWebsiteStudioView({
  foundationReady,
  hasTemplateSite,
}: {
  foundationReady: boolean;
  hasTemplateSite: boolean;
}): WebsiteStudioView {
  if (!foundationReady) return "setup";
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
