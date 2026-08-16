import {
  assessCancellationReadiness,
  buildMigrationIndependenceTasks,
  type CancellationReadiness,
  type MigrationIndependenceInputs,
} from "./migration-independence";

/**
 * Site Health scoring.
 *
 * Pure and I/O-free so the percentage every agent sees in the sidebar can be
 * exercised persona by persona — "new agent with nothing", "agent bringing an
 * existing website", "agent mid-migration" — instead of only through a live
 * Firestore read. The API route (api/sub-accounts/[id]/site-health) does the
 * reads and hands the results straight here.
 */

export interface SiteHealthInputs {
  /** businessProfile/main */
  profile: {
    completeness?: number;
    brokerage?: string;
    licenseNumber?: string;
    fairHousing?: boolean;
    noLegalTaxAdvice?: boolean;
    optOutLanguage?: string;
  };
  /** True when a legacy `website` doc is ready or has a live URL. */
  publishedWebsite: boolean;
  /** True when agentSites/main has status "published". */
  publishedAgentSite: boolean;
  /**
   * True when the agent's own website — hosted anywhere — was verified live
   * over HTTPS at the saved domain. Without this, an agent who keeps their
   * existing site can never clear the website task no matter what they do.
   */
  externalSiteVerified?: boolean;
  /** subAccounts/{id}.customDomain */
  customDomain?: string;
  hasLeadForm: boolean;
  /**
   * Present only for an account that migrated from another platform. When
   * set, its checks join the score so 100% means the old subscription can be
   * cancelled safely rather than merely that AgentStack is configured.
   */
  independence?: MigrationIndependenceInputs;
  hasBookingPage: boolean;
  webChatEnabled: boolean;
  businessEmailVerified: boolean;
}

export interface SiteHealthTask {
  id: string;
  title: string;
  detail: string;
  complete: boolean;
  href: string;
  action: string;
}

export interface SiteHealthResult {
  score: number;
  completed: number;
  total: number;
  tasks: SiteHealthTask[];
  /** Null when the account did not migrate from anywhere. */
  cancellation: CancellationReadiness | null;
}

export function buildSiteHealthTasks(
  inputs: SiteHealthInputs
): SiteHealthTask[] {
  const { profile } = inputs;
  return [
    {
      id: "blueprint",
      title: "Complete your Business Blueprint",
      detail: "Give your website and AI accurate business information.",
      complete: (profile.completeness ?? 0) >= 80,
      href: "/business-profile",
      action: "Complete profile",
    },
    {
      id: "compliance",
      title: "Confirm business and compliance details",
      detail: "Add brokerage, license, disclosure, and opt-out information.",
      complete: Boolean(
        profile.brokerage &&
        profile.licenseNumber &&
        profile.fairHousing === true &&
        profile.noLegalTaxAdvice === true &&
        profile.optOutLanguage
      ),
      href: "/business-profile",
      action: "Review details",
    },
    {
      id: "website",
      title: "Publish your website",
      detail: inputs.externalSiteVerified
        ? "Your website is live at your own domain."
        : "Put a website online — build one here, or connect the one you already have.",
      complete:
        inputs.publishedWebsite ||
        inputs.publishedAgentSite ||
        inputs.externalSiteVerified === true,
      href: "/website-studio",
      action: "Open Website Studio",
    },
    {
      id: "domain",
      title: "Connect your domain",
      detail: "Use a web address that belongs to your business.",
      complete: Boolean(inputs.customDomain),
      href: "/domain",
      action: "Connect domain",
    },
    {
      id: "lead-capture",
      title: "Create a lead-capture form",
      detail: "Give website visitors a simple way to contact you.",
      complete: inputs.hasLeadForm,
      href: "/forms",
      action: "Create form",
    },
    {
      id: "booking",
      title: "Create a booking page",
      detail: "Let qualified leads choose an appointment time.",
      complete: inputs.hasBookingPage,
      href: "/booking",
      action: "Set up booking",
    },
    {
      id: "chat",
      title: "Turn on website chat",
      detail: "Answer common questions and capture leads while you are busy.",
      complete: inputs.webChatEnabled,
      href: "/ai-agents/web-chat",
      action: "Set up chat",
    },
    {
      id: "email",
      title: "Verify your business email",
      detail: "Send follow-up from a trusted business address.",
      complete: inputs.businessEmailVerified,
      href: "/dashboard/settings",
      action: "Verify email",
    },
  ];
}

export function computeSiteHealth(inputs: SiteHealthInputs): SiteHealthResult {
  // For an account that migrated, 100% has to mean "safe to cancel the old
  // subscription" — so the independence checks are part of the score, not a
  // separate panel someone can miss. An account that started fresh has no
  // independence tasks and is unaffected.
  const tasks = [
    ...buildSiteHealthTasks(inputs),
    ...(inputs.independence
      ? buildMigrationIndependenceTasks(inputs.independence)
      : []),
  ];
  const completed = tasks.filter((task) => task.complete).length;
  const cancellation = inputs.independence
    ? assessCancellationReadiness(inputs.independence)
    : null;
  return {
    score: Math.round((completed / tasks.length) * 100),
    completed,
    total: tasks.length,
    tasks,
    cancellation,
  };
}

/** Ids of everything still blocking 100%, in display order. */
export function remainingSiteHealthTaskIds(inputs: SiteHealthInputs): string[] {
  return buildSiteHealthTasks(inputs)
    .filter((task) => !task.complete)
    .map((task) => task.id);
}
