export type OnboardingFoundationMode = "transfer" | "foundation" | "fresh";

export type BusinessSourcePlatform =
  | "gohighlevel"
  | "followupboss"
  | "kvcore"
  | "lofty"
  | "chime"
  | "wordpress"
  // WordPress the SOFTWARE, running on a host the agent chose (Hostinger,
  // SiteGround, a local web guy). Distinct from `wordpress` above, which is
  // WordPress.com the hosted service.
  //
  // Conflating the two was a real bug: an agent whose WordPress site is on
  // Hostinger picked "WordPress" (correctly describing their site), and
  // AgentStack then told them "Connected to WordPress.com", pointed Launch at
  // wordpress.com instead of their actual control panel, and declared "DNS —
  // nothing to change" on the basis of a host they were not on.
  | "wordpress_selfhosted"
  | "hostinger"
  | "bluehost"
  | "godaddy"
  | "wix"
  | "squarespace"
  | "siteground"
  | "namecheap"
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
