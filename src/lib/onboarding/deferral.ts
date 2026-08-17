import { ONBOARDING_STEPS, type OnboardingStepId } from "./steps";

/**
 * What a new operator actually has to do before AgentStack is useful, and what
 * can wait.
 *
 * Onboarding checklists default to presenting every step as equally required,
 * and that is how a setup that should take twenty minutes turns into a
 * fortnight. An agent with no Instagram sits on a social step they can never
 * complete. An agent who has just applied for A2P registration — which takes
 * weeks, and is out of their hands — cannot tick the SMS step no matter how
 * keen they are. Both stall, and a stalled setup is a churned customer.
 *
 * Almost nothing here is genuinely blocking. Exactly one step is: the business
 * profile, because every other feature reads from it and generating anything
 * without it produces filler with the operator's name on it. Everything else
 * costs a capability if skipped, and that cost is stated plainly so the choice
 * is informed rather than guessed at.
 *
 * The rule this encodes: skipping is a first-class outcome, not a failure
 * state. A deferred step is never marked complete, never disappears, and
 * always says what would bring the operator back to it.
 */

export type DeferralClass = "blocking" | "deferrable";

export interface StepDeferral {
  id: OnboardingStepId;
  deferral: DeferralClass;
  /** What the operator gives up by deferring. Empty when blocking. */
  cost: string;
  /** The moment it becomes worth returning. Empty when blocking. */
  returnWhen: string;
  /** The skip control's label — never "skip", which reads as failure. */
  skipLabel: string;
  /** Why it cannot be deferred. Empty when deferrable. */
  blockingReason: string;
}

const DEFERRALS: Record<OnboardingStepId, Omit<StepDeferral, "id">> = {
  business_profile: {
    deferral: "blocking",
    cost: "",
    returnWhen: "",
    skipLabel: "",
    blockingReason:
      "Your website, your emails, and everything Zack writes come from these details. Without them there is nothing specific to build from, and what you get back is a template with your name on it.",
  },
  domain: {
    deferral: "deferrable",
    cost:
      "Your site stays on a temporary AgentStack address instead of your own domain name.",
    returnWhen:
      "Come back when you have chosen a domain, or when you are ready to point one you already own.",
    skipLabel: "Use a temporary address for now",
    blockingReason: "",
  },
  contacts: {
    deferral: "deferrable",
    cost: "You will have no one to follow up with until contacts are added.",
    returnWhen:
      "Come back when you have your list to hand — an export, a spreadsheet, or your phone.",
    skipLabel: "Add my contacts later",
    blockingReason: "",
  },
  sms: {
    deferral: "deferrable",
    cost: "You will not be able to text leads or receive texts on a business number.",
    returnWhen:
      "Texting needs carrier registration, which takes a few weeks and is out of your hands. Start it when you can, and carry on with everything else meanwhile.",
    skipLabel: "Set up texting later",
    blockingReason: "",
  },
  form: {
    deferral: "deferrable",
    cost:
      "Visitors to your site will have no way to leave their details, so nothing arrives automatically.",
    returnWhen: "Come back before you start sending traffic to your site.",
    skipLabel: "Add a lead form later",
    blockingReason: "",
  },
  automation: {
    deferral: "deferrable",
    cost: "New leads will not get an automatic reply — you will answer each one yourself.",
    returnWhen: "Come back once leads are arriving and answering them by hand starts to slip.",
    skipLabel: "Set up follow-up later",
    blockingReason: "",
  },
  pipeline: {
    deferral: "deferrable",
    cost: "You will not have a board showing where each deal stands.",
    returnWhen: "Come back when you have more than a handful of deals to keep straight.",
    skipLabel: "Set up my pipeline later",
    blockingReason: "",
  },
  booking: {
    deferral: "deferrable",
    cost: "Clients will have to phone or email you to arrange a time.",
    returnWhen:
      "Come back once you are taking enough appointments that the back-and-forth is costing you evenings.",
    skipLabel: "Set up booking later",
    blockingReason: "",
  },
  ai: {
    deferral: "deferrable",
    cost: "No assistant will answer questions from visitors on your site.",
    returnWhen: "Come back once your site is live and getting visitors.",
    skipLabel: "Add the AI assistant later",
    blockingReason: "",
  },
};

export function deferralFor(id: OnboardingStepId): StepDeferral {
  return { id, ...DEFERRALS[id] };
}

export function isDeferrable(id: OnboardingStepId): boolean {
  return DEFERRALS[id].deferral === "deferrable";
}

/** Every step that must be done before the rest of the product works. */
export function blockingSteps(): StepDeferral[] {
  return ONBOARDING_STEPS.map((s) => deferralFor(s.id)).filter(
    (s) => s.deferral === "blocking"
  );
}

/**
 * Connections the operator may simply not have.
 *
 * Distinct from the checklist steps because there is no version of this an
 * operator can be walked through — an agent with no Instagram account cannot
 * be guided into having one, and presenting it as an outstanding task is a
 * permanent, unclearable item on their list. Every one of these is optional,
 * always, and "I don't use this" is a complete answer.
 */
export type OptionalConnection =
  | "facebook"
  | "instagram"
  | "linkedin"
  | "google_business"
  | "calendar"
  | "email_domain";

export interface ConnectionDeferral {
  id: OptionalConnection;
  label: string;
  /** True when AgentStack cannot publish here yet, whatever the operator does. */
  availableToConnect: boolean;
  cost: string;
  skipLabel: string;
}

const CONNECTIONS: Record<OptionalConnection, Omit<ConnectionDeferral, "id">> = {
  facebook: {
    label: "Facebook",
    availableToConnect: true,
    cost: "Posts will not go out to Facebook.",
    skipLabel: "I don't use Facebook",
  },
  instagram: {
    label: "Instagram",
    availableToConnect: true,
    cost: "Posts will not go out to Instagram.",
    skipLabel: "I don't use Instagram",
  },
  linkedin: {
    // Honest rather than aspirational: SocialPlatform publishes to Meta only,
    // so offering a connect button here would be a promise nothing keeps.
    label: "LinkedIn",
    availableToConnect: false,
    cost:
      "AgentStack cannot post to LinkedIn yet. You can still write posts here and paste them across.",
    skipLabel: "Not available yet",
  },
  google_business: {
    label: "Google Business Profile",
    availableToConnect: true,
    cost:
      "Your Google listing will not be managed from here, and review requests will have nowhere to send people.",
    skipLabel: "Connect Google later",
  },
  calendar: {
    label: "Calendar",
    availableToConnect: true,
    cost: "Clients will not be able to book time with you directly.",
    skipLabel: "Connect my calendar later",
  },
  email_domain: {
    label: "Sending email address",
    availableToConnect: true,
    cost:
      "Emails will send from a shared AgentStack address rather than your own domain, which lands in spam more often.",
    skipLabel: "Set up sending later",
  },
};

export function connectionDeferral(id: OptionalConnection): ConnectionDeferral {
  return { id, ...CONNECTIONS[id] };
}

export const OPTIONAL_CONNECTIONS = Object.keys(
  CONNECTIONS
) as OptionalConnection[];

/**
 * Whether the operator can finish setup right now.
 *
 * Deliberately generous: everything but the profile is optional, so a new
 * operator reaches a working product in one sitting and comes back for the
 * rest when they have what each step needs.
 */
export function canFinishSetup(completed: readonly OnboardingStepId[]): {
  canFinish: boolean;
  outstanding: StepDeferral[];
} {
  const done = new Set(completed);
  const outstanding = blockingSteps().filter((s) => !done.has(s.id));
  return { canFinish: outstanding.length === 0, outstanding };
}
