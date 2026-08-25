import type { WebsiteTransferDoc } from "@/types/website-transfer";

export function hostingIsReady(
  transfer: Partial<WebsiteTransferDoc> | null | undefined
): boolean {
  return Boolean(
    transfer?.hostingStatus === "ready" && transfer.hostingUrl?.trim()
  );
}

export function getCutoverGuidance(
  transfer: Partial<WebsiteTransferDoc> | null | undefined
): string {
  if (!transfer) {
    return "AgentStack cannot find a saved website or external-host setup yet. Open Website & Domain and record the provider that serves your current site.";
  }
  return "AgentStack does not provide hosting or DNS cutover. Keep the current website, DNS records, email records, and nameservers with the external provider, and use Check my domain to verify the live site.";
}
