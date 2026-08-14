import type { WebsiteTransferDoc } from "@/types/website-transfer";

export function hostingIsReady(
  transfer: Partial<WebsiteTransferDoc> | null | undefined
): boolean {
  return Boolean(
    transfer?.status === "approved" &&
    transfer.hostingStatus === "ready" &&
    transfer.hostingUrl?.trim()
  );
}

export function getCutoverGuidance(
  transfer: Partial<WebsiteTransferDoc> | null | undefined
): string {
  if (!transfer) {
    return "AgentStack cannot find a saved website replacement yet. Return to Website Studio and open Imported exact site.";
  }
  if (transfer.status !== "approved") {
    return "The replacement still needs your approval. Open the private comparison and approve it only after the pages match.";
  }
  if (!hostingIsReady(transfer)) {
    return "No action is required from you right now. AgentStack has saved the managed-hosting request, but the standalone hosting URL and SSL certificate are not verified yet. Keep the current website, Cloudflare settings, DNS records, and nameservers unchanged. Return to this AgentStack screen later; the exact DNS records will unlock here when hosting is ready.";
  }
  return "Managed hosting is ready and the standalone URL has been verified. Use only the exact DNS records shown on this AgentStack screen; do not change nameservers unless the on-screen instructions explicitly require it.";
}
