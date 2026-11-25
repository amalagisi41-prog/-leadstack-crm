import type { SubAccountDoc } from "@/types/tenancy";
import { SUB_ACCOUNT_ROUTES } from "@/lib/navigation/sub-account-routes";
import { AGENTSTACK_METHOD_STEP_NAMES } from "@/config/landing";
import { setupDoneMap, type SetupStepId } from "./setup-progress";
import { OPTIONAL_ONBOARDING_STEP_IDS, type OnboardingStepId } from "./steps";

/**
 * The AgentStack Method™ — the six steps the marketing site sells (Build →
 * Connect → Capture → Respond → Nurture → Close), as the ONE model every
 * in-app progress figure is computed from: the dashboard card, the setup
 * pill, the sidebar's Setup badge and the setup hub. Before this, the
 * dashboard counted a four-step checklist grouping, the pill counted five
 * unnamed account steps, and the sidebar showed the unrelated Site Health
 * score, so one workspace read three different numbers on the same screen.
 *
 * Each Method step groups existing setup tasks; nothing about how a task is
 * done changed. A task is satisfied by the same derived facts as before:
 * account steps (business details, email/phone, listings, social, domain)
 * from the sub-account document, checklist steps (contacts, forms, Speed-to-
 * Lead, …) from GET /api/sub-accounts/{id}/onboarding.
 */

export type MethodStepId = "build" | "connect" | "capture" | "respond" | "nurture" | "close";
export type MethodStepStatus = "complete" | "in_progress" | "not_started";

/** An account setup step (setup-progress) or a checklist step (steps.ts). */
export type MethodTaskId = SetupStepId | OnboardingStepId;

const setupPath = (step: SetupStepId) =>
  `${SUB_ACCOUNT_ROUTES.getStarted}?revisit=1#setup-step-${step}`;

export interface MethodTaskMeta {
  id: MethodTaskId;
  label: string;
  /** Sub-account-relative path where this task is done. */
  href: string;
}

export interface MethodStepMeta {
  id: MethodStepId;
  name: string;
  /** The marketing site's one-line description, word for word. */
  summary: string;
  tasks: readonly MethodTaskMeta[];
}

export const METHOD_STEPS: readonly MethodStepMeta[] = [
  {
    id: "build",
    name: AGENTSTACK_METHOD_STEP_NAMES[0],
    summary: "Profile, brand, brokerage",
    tasks: [
      { id: "identity", label: "Add your business details", href: setupPath("identity") },
      { id: "business_profile", label: "Fill in your Business Blueprint", href: SUB_ACCOUNT_ROUTES.businessProfile },
    ],
  },
  {
    id: "connect",
    name: AGENTSTACK_METHOD_STEP_NAMES[1],
    summary: "Contacts, site and channels",
    tasks: [
      { id: "communications", label: "Connect your email or phone", href: setupPath("communications") },
      { id: "contacts", label: "Import your contacts", href: `${SUB_ACCOUNT_ROUTES.contacts}?import=1` },
      { id: "listings", label: "Connect your listings", href: setupPath("listings") },
      { id: "social", label: "Connect Facebook & Instagram", href: setupPath("social") },
    ],
  },
  {
    id: "capture",
    name: AGENTSTACK_METHOD_STEP_NAMES[2],
    summary: "Forms and appointments",
    tasks: [
      { id: "form", label: "Create a lead-capture form", href: SUB_ACCOUNT_ROUTES.forms },
      { id: "domain", label: "Connect your domain", href: setupPath("domain") },
    ],
  },
  {
    id: "respond",
    name: AGENTSTACK_METHOD_STEP_NAMES[3],
    summary: "Approved first response",
    tasks: [
      { id: "automation", label: "Turn on Speed-to-Lead", href: SUB_ACCOUNT_ROUTES.workflows },
      { id: "ai", label: "Set up your AI agent", href: SUB_ACCOUNT_ROUTES.aiAgents },
    ],
  },
  {
    id: "nurture",
    name: AGENTSTACK_METHOD_STEP_NAMES[4],
    summary: "Timely follow-up",
    tasks: [
      { id: "sms", label: "Text and call leads from the CRM", href: SUB_ACCOUNT_ROUTES.messagingSettings },
      { id: "lseo", label: "Start a local search campaign", href: SUB_ACCOUNT_ROUTES.marketingCampaigns },
    ],
  },
  {
    id: "close",
    name: AGENTSTACK_METHOD_STEP_NAMES[5],
    summary: "Appointments and deals",
    tasks: [
      { id: "booking", label: "Publish a booking page", href: SUB_ACCOUNT_ROUTES.booking },
      { id: "pipeline", label: "Set up your deal pipeline", href: SUB_ACCOUNT_ROUTES.pipeline },
    ],
  },
];

export const METHOD_STEP_IDS: readonly MethodStepId[] = METHOD_STEPS.map((s) => s.id);
export const METHOD_STEP_COUNT = METHOD_STEPS.length;

/** Account steps the realtor may skip (setup-progress's skippable set). */
const SKIPPABLE: ReadonlySet<MethodTaskId> = new Set(["listings", "social", "domain"]);
const OPTIONAL: ReadonlySet<MethodTaskId> = new Set(OPTIONAL_ONBOARDING_STEP_IDS);
const SETUP_IDS: ReadonlySet<string> = new Set(["identity", "communications", "listings", "social", "domain"]);

export interface MethodInputs {
  /** Done-ness of the account steps (setup-progress setupDoneMap). */
  setupDone: Record<SetupStepId, boolean>;
  /** Account steps the realtor explicitly skipped. */
  skipped: readonly string[];
  /** Checklist step ids the onboarding API counts as done. */
  checklistDone: readonly string[];
}

export interface MethodTaskState extends MethodTaskMeta {
  done: boolean;
  skipped: boolean;
  optional: boolean;
}

export interface MethodStepState extends Omit<MethodStepMeta, "tasks"> {
  status: MethodStepStatus;
  tasks: MethodTaskState[];
  /** First unfinished task, for "next" links; null once the step is complete. */
  nextTask: MethodTaskState | null;
}

export interface MethodProgress {
  steps: MethodStepState[];
  completedCount: number;
  total: number;
  /** completedCount / total, rounded — the same figure shown as "x of 6". */
  percent: number;
  complete: boolean;
  nextStep: MethodStepState | null;
}

function taskState(meta: MethodTaskMeta, inputs: MethodInputs): MethodTaskState {
  const checklist = new Set(inputs.checklistDone);
  const isSetup = SETUP_IDS.has(meta.id);
  // "domain" is both an account step and a checklist step; either proof counts.
  const done =
    (isSetup && inputs.setupDone[meta.id as SetupStepId] === true) || checklist.has(meta.id);
  const skipped = !done && SKIPPABLE.has(meta.id) && inputs.skipped.includes(meta.id);
  return { ...meta, done, skipped, optional: OPTIONAL.has(meta.id) };
}

export function computeMethodProgress(inputs: MethodInputs): MethodProgress {
  const steps: MethodStepState[] = METHOD_STEPS.map((meta) => {
    const tasks = meta.tasks.map((t) => taskState(t, inputs));
    const satisfied = (t: MethodTaskState) => t.done || t.skipped;
    const required = tasks.filter((t) => !t.optional);
    // A step whose tasks are all optional (Nurture) needs at least one done —
    // otherwise it would count as complete before anyone touched it.
    const complete =
      required.length > 0 ? required.every(satisfied) : tasks.some((t) => t.done);
    const started = tasks.some(satisfied);
    const status: MethodStepStatus = complete ? "complete" : started ? "in_progress" : "not_started";
    const nextTask = complete ? null : (tasks.find((t) => !satisfied(t) && !t.optional) ?? tasks.find((t) => !satisfied(t)) ?? null);
    return { id: meta.id, name: meta.name, summary: meta.summary, status, tasks, nextTask };
  });
  const completedCount = steps.filter((s) => s.status === "complete").length;
  const total = steps.length;
  return {
    steps,
    completedCount,
    total,
    percent: Math.round((completedCount / total) * 100),
    complete: completedCount === total,
    nextStep: steps.find((s) => s.status !== "complete") ?? null,
  };
}

/** Convenience: build the inputs from a sub-account plus the two derived reads. */
export function methodInputsFor(
  subAccount: SubAccountDoc,
  identityDone: boolean,
  checklistDone: readonly string[],
): MethodInputs {
  return {
    setupDone: setupDoneMap(subAccount, identityDone),
    skipped: subAccount.setupSkippedSteps ?? [],
    checklistDone,
  };
}

/** "Build · Add your business details" — the label the pill and dashboard show. */
export function nextActionLabel(progress: MethodProgress): string | null {
  const step = progress.nextStep;
  if (!step) return null;
  return step.nextTask ? `${step.name} · ${step.nextTask.label}` : step.name;
}

/** Which Method step each account setup step belongs to (Setup page labels). */
export function methodStepForSetupStep(step: SetupStepId): { name: string; number: number } {
  const index = METHOD_STEPS.findIndex((s) => s.tasks.some((t) => t.id === step));
  return { name: METHOD_STEPS[index].name, number: index + 1 };
}

/** The sidebar's Setup badge text: "2/6", or null once setup is complete. */
export function setupBadgeText(progress: MethodProgress | null): string | null {
  return progress && !progress.complete ? `${progress.completedCount}/${progress.total}` : null;
}
