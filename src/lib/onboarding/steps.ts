import { SUB_ACCOUNT_ROUTES } from "@/lib/navigation/sub-account-routes";

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
  | "booking"
  | "pipeline"
  | "ai"
  | "domain";

export interface OnboardingStepMeta {
  id: OnboardingStepId;
  /**
   * The outcome, not the task.
   *
   * "Connect your domain" describes work the operator has to do. "Book more
   * appointments with automated scheduling" describes what they get for doing
   * it. A checklist of chores gets abandoned; a list of outcomes gets worked
   * through, and it is the reason the same nine items read as a benefit rather
   * than a backlog.
   */
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
    title: "Get every AI reply sounding like you",
    description:
      "Tell AgentStack about your business once — name, brokerage, services, brand voice, compliance rules, and FAQs. Every AI agent, email, and automation pulls from this profile automatically.",
    cta: "Set up business profile",
    href: SUB_ACCOUNT_ROUTES.businessProfile,
    videoMinutes: 5,
  },
  {
    id: "contacts",
    title: "Bring your whole database into one place",
    description:
      "Upload a CSV from your old CRM or add your first contacts manually. Your entire database lives here.",
    cta: "Go to People",
    href: "/contacts?import=1",
    videoMinutes: 4,
  },
  {
    id: "sms",
    title: "Text and call leads without leaving the CRM",
    description:
      "Link your dedicated Twilio number so you can send and receive SMS directly in the CRM — and the AI can reply on your behalf. Then register for A2P 10DLC right below it so carriers actually deliver your texts.",
    cta: "Open SMS Settings",
    href: "/dashboard/settings?tab=messaging",
    videoMinutes: 3,
  },
  {
    id: "form",
    title: "Turn website visitors into leads automatically",
    description:
      "Create a form for your website or a landing page. Every submission auto-creates a contact and drops them into your pipeline.",
    cta: "Build a Form",
    href: SUB_ACCOUNT_ROUTES.forms,
    videoMinutes: 5,
  },
  {
    id: "automation",
    title: "Answer every new lead within 60 seconds",
    description:
      "Attach the Speed-to-Lead automation to your form so every new inquiry gets an SMS and email within 60 seconds — automatically.",
    cta: "Open Follow-Up Plans",
    href: SUB_ACCOUNT_ROUTES.workflows,
    videoMinutes: 4,
  },
  {
    id: "booking",
    title: "Book more appointments with automated scheduling",
    description:
      "Share a link and let clients pick a time that already works for you. Confirmations and reminders go out on their own, so fewer people forget to turn up.",
    cta: "Set Up Booking",
    href: SUB_ACCOUNT_ROUTES.booking,
    videoMinutes: 4,
  },
  {
    id: "pipeline",
    title: "See exactly where every deal stands",
    description:
      "Your pipeline is pre-set for real estate: New Lead → Contacted → Showing Scheduled → Offer Made → Closed. Drag deals as they progress.",
    cta: "View Deals",
    href: SUB_ACCOUNT_ROUTES.pipeline,
    videoMinutes: 3,
  },
  {
    id: "ai",
    title: "Let AI answer questions while you show homes",
    description:
      "Your AI agent persona is pre-written for a CT realtor. Review it, add your business name, then enable it on SMS and Web Chat.",
    cta: "Set Up AI Agent",
    href: SUB_ACCOUNT_ROUTES.aiAgents,
    videoMinutes: 5,
  },
  {
    id: "domain",
    title: "Put your business on your own web address",
    description:
      "The final step — point your website to your own domain. Already own one? We'll show you the exact DNS records to add. Need one? We'll walk you through registering a new one.",
    cta: "Connect Domain",
    href: SUB_ACCOUNT_ROUTES.domain,
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
