/**
 * Canonical onboarding-checklist steps.
 *
 * Single source of truth shared by:
 *   - components/dashboard/onboarding-checklist.tsx (the in-app checklist
 *     shown to a new agent on first login)
 *   - components/agency/onboarding-videos-section.tsx (Agency → Settings,
 *     where the owner pastes a walkthrough video URL per step)
 *
 * The agency stores video URLs keyed by these ids on
 * `agencies/{id}.onboardingVideos`. Keep ids stable — changing one orphans
 * any saved URL under the old key.
 *
 * Plain data only (no JSX / icons) so it's safe to import from server code
 * (the agency PATCH route validates against ONBOARDING_STEP_IDS) and client
 * components alike. The checklist owns the icon mapping separately.
 */

export type OnboardingStepId =
  | "business_profile"
  | "contacts"
  | "sms"
  | "form"
  | "automation"
  | "pipeline"
  | "ai"
  | "domain";

export interface OnboardingStepMeta {
  id: OnboardingStepId;
  title: string;
  description: string;
  /** CTA button label in the expanded step. */
  cta: string;
  /** saPath-relative link the CTA navigates to. */
  href: string;
  /** Rough runtime of the walkthrough video, shown on the "Watch" button. */
  videoMinutes: number;
}

export type OnboardingMethodStepId =
  | "build"
  | "connect"
  | "capture"
  | "respond";

export interface OnboardingMethodStepMeta {
  id: OnboardingMethodStepId;
  title: string;
  description: string;
  cta: string;
  href: string;
  videoMinutes: number;
  stepIds: readonly OnboardingStepId[];
}

export const ONBOARDING_STEPS: readonly OnboardingStepMeta[] = [
  {
    id: "business_profile",
    title: "Set up your business profile",
    description:
      "Tell AgentStack about your business once — name, brokerage, services, brand voice, compliance rules, and FAQs. Every AI agent, email, and automation pulls from this profile automatically.",
    cta: "Set up business profile",
    href: "/business-profile",
    videoMinutes: 5,
  },
  {
    id: "contacts",
    title: "Import your contacts",
    description:
      "Upload a CSV from your old CRM or add your first contacts manually. Your entire database lives here.",
    cta: "Go to People",
    href: "/contacts?import=1",
    videoMinutes: 4,
  },
  {
    id: "sms",
    title: "Connect your phone number",
    description:
      "Link your dedicated Twilio number so you can send and receive SMS directly in the CRM — and the AI can reply on your behalf.",
    cta: "Open SMS Settings",
    href: "/dashboard/settings?tab=sms",
    videoMinutes: 3,
  },
  {
    id: "form",
    title: "Build your lead capture form",
    description:
      "Create a form for your website or a landing page. Every submission auto-creates a contact and drops them into your pipeline.",
    cta: "Build a Form",
    href: "/forms",
    videoMinutes: 5,
  },
  {
    id: "automation",
    title: "Turn on Speed-to-Lead",
    description:
      "Attach the Speed-to-Lead automation to your form so every new inquiry gets an SMS and email within 60 seconds — automatically.",
    cta: "Set Up Automation",
    href: "/automations",
    videoMinutes: 4,
  },
  {
    id: "pipeline",
    title: "Review your pipeline",
    description:
      "Your pipeline is pre-set for real estate: New Lead → Contacted → Showing Scheduled → Offer Made → Closed. Drag deals as they progress.",
    cta: "View Deals",
    href: "/pipeline",
    videoMinutes: 3,
  },
  {
    id: "ai",
    title: "Activate your AI agent",
    description:
      "Your AI agent persona is pre-written for a CT realtor. Review it, add your business name, then enable it on SMS and Web Chat.",
    cta: "Set Up AI Agent",
    href: "/ai-agents",
    videoMinutes: 5,
  },
  {
    id: "domain",
    title: "Connect your domain",
    description:
      "The final step — point your website to your own domain. Already own one? We'll show you the exact DNS records to add. Need one? We'll walk you through registering a new one.",
    cta: "Connect Domain",
    href: "/domain",
    videoMinutes: 4,
  },
];

export const ONBOARDING_STEP_IDS: readonly OnboardingStepId[] =
  ONBOARDING_STEPS.map((s) => s.id);

export const ONBOARDING_METHOD_STEPS: readonly OnboardingMethodStepMeta[] = [
  {
    id: "build",
    title: "Build your business setup",
    description:
      "Set your business profile so AgentStack knows your services, voice, hours, and FAQs before anything goes live.",
    cta: "Open Build step",
    href: "/get-started?step=build",
    videoMinutes: 5,
    stepIds: ["business_profile"],
  },
  {
    id: "connect",
    title: "Connect your people and channels",
    description:
      "Import contacts and connect your phone number so every lead lands in one place with a real conversation history.",
    cta: "Open Connect step",
    href: "/get-started?step=connect",
    videoMinutes: 5,
    stepIds: ["contacts", "sms"],
  },
  {
    id: "capture",
    title: "Capture every new inquiry",
    description:
      "Launch your lead forms and connect the public site pieces that feed fresh opportunities into your workspace automatically.",
    cta: "Open Capture step",
    href: "/get-started?step=capture",
    videoMinutes: 4,
    stepIds: ["form", "domain"],
  },
  {
    id: "respond",
    title: "Respond automatically",
    description:
      "Turn on Speed-to-Lead, review your pipeline, and activate your AI follow-up so nothing sits untouched after a lead comes in.",
    cta: "Open Respond step",
    href: "/get-started?step=respond",
    videoMinutes: 5,
    stepIds: ["automation", "pipeline", "ai"],
  },
] as const;

export const ONBOARDING_METHOD_STEP_IDS: readonly OnboardingMethodStepId[] =
  ONBOARDING_METHOD_STEPS.map((step) => step.id);

/** True once every onboarding step id is present in `completed`. */
export function isOnboardingComplete(
  completed: readonly string[] | null | undefined,
): boolean {
  if (!completed) return false;
  const set = new Set(completed);
  return ONBOARDING_STEP_IDS.every((id) => set.has(id));
}

/** Per-step walkthrough video URLs, keyed by step id. */
export type OnboardingVideos = Partial<Record<OnboardingStepId, string>>;

export function isOnboardingMethodStepComplete(
  step: OnboardingMethodStepMeta,
  completed: readonly string[] | null | undefined,
): boolean {
  if (!completed) return false;
  const set = new Set(completed);
  return step.stepIds.every((id) => set.has(id));
}

export function getOnboardingMethodVideoUrl(
  step: OnboardingMethodStepMeta,
  videos: OnboardingVideos | null | undefined,
): string | null {
  if (!videos) return null;
  for (const id of step.stepIds) {
    const url = videos[id]?.trim();
    if (url) return url;
  }
  return null;
}
