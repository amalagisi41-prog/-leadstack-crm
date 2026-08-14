export type TransferItemStatus = "copied" | "needs_approval" | "cannot_access";
export type WebsiteTransferStatus =
  | "scanning"
  | "scan_complete"
  | "preview_ready"
  | "approved"
  | "error";

export interface WebsiteTransferPage {
  url: string;
  path: string;
  title: string;
  description: string;
  status: TransferItemStatus;
  httpStatus: number | null;
  imageCount: number;
  formCount: number;
  scriptCount: number;
  notes: string[];
  snapshotHtml?: string;
}

export interface WebsiteTransferInventory {
  pages: number;
  navigationLinks: string[];
  images: string[];
  fonts: string[];
  colors: string[];
  stylesheets: string[];
  scripts: string[];
  forms: number;
  tracking: string[];
  redirects: string[];
  cms: string | null;
  hosting: string | null;
  dnsProvider: string | null;
}

export interface WebsiteTransferDoc {
  id: string;
  snapshotVersion?: number;
  sourceUrl: string;
  status: WebsiteTransferStatus;
  stage: number;
  pages: WebsiteTransferPage[];
  inventory: WebsiteTransferInventory;
  error: string | null;
  privatePreviewPath: string | null;
  approvedAt: string | null;
  baselineApprovedAt?: string | null;
  hostingStatus?: "not_requested" | "requested" | "ready";
  hostingRequestedAt?: string | null;
  hostingUrl?: string | null;
  createdAt: string;
  updatedAt: string;
}
