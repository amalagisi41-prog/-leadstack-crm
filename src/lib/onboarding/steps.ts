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
  | "contacts"
  | "sms"
  | "form"
  | "automation"
  | "pipeline"
  | "ai";

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

export const ONBOARDING_STEPS: readonly OnboardingStepMeta[] = [
  {
    id: "contacts",
    title: "Import your contacts",
    description:
      "Upload a CSV from your old CRM or add your first contacts manually. Your entire database lives here.",
    cta: "Go to Contacts",
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
    cta: "View Pipeline",
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
];

export const ONBOARDING_STEP_IDS: readonly OnboardingStepId[] =
  ONBOARDING_STEPS.map((s) => s.id);

/** Per-step walkthrough video URLs, keyed by step id. */
export type OnboardingVideos = Partial<Record<OnboardingStepId, string>>;
