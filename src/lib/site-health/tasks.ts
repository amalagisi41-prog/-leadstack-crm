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
  /** subAccounts/{id}.customDomain */
  customDomain?: string;
  hasLeadForm: boolean;
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
      detail: "Put an approved AgentStack website online.",
      complete: inputs.publishedWebsite || inputs.publishedAgentSite,
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
  const tasks = buildSiteHealthTasks(inputs);
  const completed = tasks.filter((task) => task.complete).length;
  return {
    score: Math.round((completed / tasks.length) * 100),
    completed,
    total: tasks.length,
    tasks,
  };
}

/** Ids of everything still blocking 100%, in display order. */
export function remainingSiteHealthTaskIds(inputs: SiteHealthInputs): string[] {
  return buildSiteHealthTasks(inputs)
    .filter((task) => !task.complete)
    .map((task) => task.id);
}
