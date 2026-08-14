import type { WebsiteTransferDoc } from "@/types/website-transfer";

export type WebsiteStudioView = "exact" | "builder" | "vibe" | "setup";

export function hasImportedExactSite(
  transfer: WebsiteTransferDoc | null | undefined
): boolean {
  return Boolean(
    transfer &&
    (transfer.snapshotVersion ?? 1) >= 2 &&
    transfer.pages?.some((page) => Boolean(page.snapshotHtml)) &&
    transfer.status !== "scanning" &&
    transfer.status !== "error"
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
