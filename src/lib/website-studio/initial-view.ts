import type { WebsiteTransferDoc } from "@/types/website-transfer";

export type WebsiteStudioView = "exact" | "builder" | "vibe" | "setup";
export type WebsiteStudioWorkspace = "home" | "vibe" | "exact";

export function hasImportedExactSite(
  transfer: WebsiteTransferDoc | null | undefined
): boolean {
  return Boolean(
    transfer &&
    (transfer.snapshotVersion ?? 1) >= 2 &&
    transfer.pages?.length > 0 &&
    ["preview_ready", "approved"].includes(transfer.status)
  );
}

export function getInitialWebsiteStudioView({
  foundationReady,
  transfer,
  hasTemplateSite,
}: {
  foundationReady: boolean;
  transfer: WebsiteTransferDoc | null | undefined;
  hasTemplateSite: boolean;
}): WebsiteStudioView {
  if (!foundationReady) return "setup";
  if (hasImportedExactSite(transfer)) return "exact";
  return hasTemplateSite ? "vibe" : "builder";
}

export function getWorkspaceWebsiteStudioView({
  workspace,
  foundationReady,
  transfer,
  hasTemplateSite,
}: {
  workspace: WebsiteStudioWorkspace;
  foundationReady: boolean;
  transfer: WebsiteTransferDoc | null | undefined;
  hasTemplateSite: boolean;
}): WebsiteStudioView {
  if (workspace === "vibe") {
    return hasImportedExactSite(transfer) && !transfer?.baselineApprovedAt
      ? "exact"
      : "vibe";
  }
  if (workspace === "exact") {
    return hasImportedExactSite(transfer) ? "exact" : "setup";
  }
  return getInitialWebsiteStudioView({
    foundationReady,
    transfer,
    hasTemplateSite,
  });
}
