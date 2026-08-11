export type OnboardingFoundationMode = "transfer" | "foundation" | "fresh";

export type BusinessSourcePlatform =
  | "gohighlevel"
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

export interface OnboardingFoundation {
  completed: boolean;
  mode: OnboardingFoundationMode | null;
  sourcePlatform: BusinessSourcePlatform | null;
  sourceUrl: string;
  domainStartingPoint: DomainStartingPoint | null;
  profileImported: boolean;
  updatedAt?: unknown;
}

export const EMPTY_ONBOARDING_FOUNDATION: OnboardingFoundation = {
  completed: false,
  mode: null,
  sourcePlatform: null,
  sourceUrl: "",
  domainStartingPoint: null,
  profileImported: false,
};
