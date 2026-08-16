/**
 * Resumable status for a provider-managed website/hosting migration.
 *
 * Website Studio 2.0 intentionally stores no fetched HTML, scripts, CSS, or
 * third-party preview payloads. Legacy Firestore fields may remain in old
 * documents, but the application does not read or render them.
 */
export type WebsiteTransferStatus =
  | "setup_required"
  | "transfer_requested"
  | "hosting_ready"
  | "error";

export interface WebsiteTransferDoc {
  id: string;
  sourceUrl: string;
  sourcePlatform?: string;
  status: WebsiteTransferStatus;
  stage: number;
  provider?: string | null;
  providerStatus?: "not_started" | "started" | "complete" | "error";
  hostingStatus?: "not_requested" | "requested" | "ready";
  hostingRequestedAt?: string | null;
  hostingUrl?: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}
