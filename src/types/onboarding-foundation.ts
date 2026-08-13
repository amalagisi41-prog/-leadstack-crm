export type OnboardingFoundationMode = "transfer" | "foundation" | "fresh";

export type BusinessSourcePlatform =
  | "gohighlevel"
  | "followupboss"
  | "kvcore"
  | "lofty"
  | "chime"
  | "wordpress"
  | "bluehost"
  | "godaddy"
  | "wix"
  | "squarespace"
  | "vercel"
  | "nextjs"
  | "make"
  | "vibe"
  | "zillow"
  | "realtor"
  | "homes"
  | "other";

export type DomainStartingPoint = "have_domain" | "need_domain" | "not_sure";
export type HostingStartingPoint =
  | "agentstack_managed"
  | "transfer_existing"
  | "keep_existing";

export interface OnboardingFoundation {
  completed: boolean;
  mode: OnboardingFoundationMode | null;
  sourcePlatform: BusinessSourcePlatform | null;
  sourceUrl: string;
  domainStartingPoint: DomainStartingPoint | null;
  hostingStartingPoint: HostingStartingPoint | null;
  domainName?: string;
  domainSetupConfirmed?: boolean;
  hostingSetupConfirmed?: boolean;
  profileImported: boolean;
  updatedAt?: unknown;
}

export const EMPTY_ONBOARDING_FOUNDATION: OnboardingFoundation = {
  completed: false,
  mode: null,
  sourcePlatform: null,
  sourceUrl: "",
  domainStartingPoint: null,
  hostingStartingPoint: null,
  domainName: "",
  domainSetupConfirmed: false,
  hostingSetupConfirmed: false,
  profileImported: false,
};
