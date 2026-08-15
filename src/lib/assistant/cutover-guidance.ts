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
    return "AgentStack cannot find a saved website or hosting setup yet. Open Website & Domain and choose the path that matches your situation.";
  }
  if (!hostingIsReady(transfer)) {
    return "The hosting destination and SSL certificate are not verified yet. Keep the current website, DNS records, email records, and nameservers unchanged. Continue in Website & Domain; DNS instructions unlock only after AgentStack verifies the hosted site.";
  }
  return "Managed hosting is ready and the standalone URL has been verified. Use only the exact DNS records shown on this AgentStack screen; do not change nameservers unless the on-screen instructions explicitly require it.";
}
