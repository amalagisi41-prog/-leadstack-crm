"use client";

import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Building2,
  Link2,
  Target,
  Zap,
  TrendingUp,
  Star,
  CheckCircle2,
  ArrowRight,
  Upload,
  Users,
  Phone,
  Bot,
  FileText,
  Sparkles,
  ChevronRight,
  Loader2,
  HeartPulse,
} from "lucide-react";
import { SUB_ACCOUNT_ROUTES } from "@/lib/navigation/sub-account-routes";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  ONBOARDING_STEPS,
  ONBOARDING_STEP_IDS,
  OPTIONAL_ONBOARDING_STEP_IDS,
} from "@/lib/onboarding/steps";
import { computeOnboardingState } from "@/lib/onboarding/state-machine";
import { AGENTSTACK_METHOD_NAME } from "@/config/landing";

/* ---------- types ---------- */

type WizardStep = 0 | 1 | 2 | 3 | 4 | 5;
export type OnboardingWizardStepKey =
  | "build"
  | "connect"
  | "capture"
  | "respond"
  | "nurture"
  | "close";

interface WizardProps {
  subAccountId: string;
  saPath: (p: string) => string;
  initialCompleted: string[];
  initialStep?: OnboardingWizardStepKey | null;
}

const WIZARD_STEP_INDEX: Record<OnboardingWizardStepKey, WizardStep> = {
  build: 0,
  connect: 1,
  capture: 2,
  respond: 3,
  nurture: 4,
  close: 5,
};

/* ---------- step metadata ---------- */

const WIZARD_STEPS = [
  {
    id: "build" as const,
    label: "Domain + Hosting",
    icon: Building2,
    tagline: "Establish the digital home",
  },
  {
    id: "connect" as const,
    label: "Business Blueprint",
    icon: Link2,
    tagline: "Approve essential business facts",
  },
  {
    id: "capture" as const,
    label: "Lead Capture",
    icon: Target,
    tagline: "Lead capture systems",
  },
  {
    id: "respond" as const,
    label: "Instant AI Response",
    icon: Zap,
    tagline: "Instant AI response",
  },
  {
    id: "nurture" as const,
    label: "Follow-Up",
    icon: TrendingUp,
    tagline: "Automatic follow-up",
  },
  {
    id: "close" as const,
    label: "Go Live",
    icon: Star,
    tagline: "Start closing deals",
  },
] as const;

/* ---------- funnel cards ---------- */

const FUNNEL_RECOMMENDATIONS = [
  {
    id: "buyer_lead_form",
    title: "Buyer Lead Form",
    description:
      "Capture buyer inquiries 24/7. AI follows up within 60 seconds.",
    badge: "Most popular",
  },
  {
    id: "seller_valuation",
    title: "Home Valuation Request",
    description:
      "Sellers request a free home value estimate. AI qualifies them immediately.",
    badge: "High intent",
  },
  {
    id: "open_house",
    title: "Open House Sign-in",
    description:
      "Digital sign-in sheet. AI texts attendees within minutes of leaving.",
    badge: "",
  },
];

/* ---------- persist helper ---------- */

/**
 * Returns true when the save actually landed.
 *
 * This used to end in `.catch(() => {})`, which made a failed save
 * indistinguishable from a successful one. That mattered most at the finish
 * line: if the final PATCH failed, `onboardingWizardCompletedAt` was never
 * written, so the dashboard's gate stayed false and immediately redirected
 * back here — restarting the operator at "Step 1 of 6" with no explanation,
 * every time they tried. Silence is the wrong default for the one write the
 * whole flow depends on.
 */
async function persistSteps(
  subAccountId: string,
  steps: string[],
  opts: { wizardCompleted?: boolean } = {},
): Promise<boolean> {
  try {
    const res = await fetch(`/api/sub-accounts/${subAccountId}/onboarding`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        steps,
        ...(opts.wizardCompleted ? { wizardCompleted: true } : {}),
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/* ---------- main component ---------- */

export function OnboardingWizard({
  subAccountId,
  saPath,
  initialCompleted,
  initialStep,
}: WizardProps) {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState<WizardStep>(() =>
    initialStep
      ? WIZARD_STEP_INDEX[initialStep]
      : ((computeOnboardingState(initialCompleted).nextWizardStepIndex ??
          5) as WizardStep)
  );
  const [completed, setCompleted] = useState<Set<string>>(
    () => new Set(initialCompleted)
  );
  const [chosenFunnel, setChosenFunnel] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);

  useEffect(() => {
    if (!initialStep) return;
    setCurrentStep(WIZARD_STEP_INDEX[initialStep]);
  }, [initialStep]);

  const markDone = useCallback(
    (ids: string[]) => {
      setCompleted((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.add(id));
        void persistSteps(subAccountId, Array.from(next));
        return next;
      });
    },
    [subAccountId]
  );

  const advance = useCallback(
    (idsToMark: string[] = []) => {
      if (idsToMark.length) markDone(idsToMark);
      setCurrentStep((s) => Math.min(s + 1, 5) as WizardStep);
    },
    [markDone]
  );

  const finish = useCallback(async () => {
    if (finishing) return;
    setFinishing(true);
    // Persist only what the agent actually did. This used to mark every step
    // complete on the way out, so someone who skipped the whole wizard was
    // told they were finished — and the checklist agreed, claiming they had
    // imported contacts and connected a phone number they had never touched.
    const done = ONBOARDING_STEP_IDS.filter((id) => completed.has(id));
    // Record that the wizard itself was finished, separately from which
    // checklist items got done. Without this the dashboard bounced the
    // operator straight back here: it gated on all nine checklist ids, and
    // this wizard has no step for `contacts`, `sms`, or `booking`, so the
    // condition was unsatisfiable no matter how diligently they worked
    // through it. Those three stay outstanding on the checklist — they are
    // genuinely not done — they just no longer bar the door.
    const saved = await persistSteps(subAccountId, done, {
      wizardCompleted: true,
    });

    // Navigating on a failed save is what created the restart loop: the
    // dashboard would bounce them back here and the wizard would reopen at
    // step 1. Keep them on this step, say what happened, and let them retry.
    if (!saved) {
      setFinishing(false);
      toast.error(
        "We couldn't save your setup just now. Check your connection and press Finish again — nothing you entered has been lost."
      );
      return;
    }

    router.replace(saPath("/dashboard?welcome=1"));
    router.refresh();
  }, [completed, finishing, router, saPath, subAccountId]);

  return (
    <div className="to-background flex min-h-[calc(100vh-4rem)] flex-col bg-gradient-to-b from-[#fff8ee]">
      {/* ── top progress bar ── */}
      <div className="bg-muted h-1 w-full">
        <div
          className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-500"
          style={{ width: `${((currentStep + 1) / 6) * 100}%` }}
        />
      </div>

      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-5 p-4 md:p-8">
        <div className="flex flex-col justify-between gap-3 rounded-2xl border bg-white/80 px-5 py-4 shadow-sm backdrop-blur sm:flex-row sm:items-center">
          <div>
            <p className="text-xs font-semibold tracking-[0.22em] text-[#DB4F9B] uppercase">
              Your 15-minute business launch
            </p>
            <h1 className="mt-1 text-xl font-semibold tracking-tight text-[#173B7A]">
              We&apos;ll build the system. You approve what goes live.
            </h1>
          </div>
          <div className="rounded-full bg-[#173B7A]/5 px-3 py-1.5 text-xs font-medium text-[#173B7A]">
            Step {currentStep + 1} of 6
          </div>
        </div>

        <div className="flex flex-1 gap-0 md:gap-8">
          {/* ── left sidebar — The AgentStack Method™ ── */}
          <aside className="hidden w-52 shrink-0 flex-col gap-1 pt-2 md:flex">
            <p className="text-muted-foreground mb-3 text-[11px] font-semibold tracking-wider uppercase">
              {AGENTSTACK_METHOD_NAME}
            </p>
            {WIZARD_STEPS.map((step, idx) => {
              const isActive = idx === currentStep;
              const isDone = idx < currentStep;
              return (
                <button
                  type="button"
                  onClick={() => setCurrentStep(idx as WizardStep)}
                  aria-current={isActive ? "step" : undefined}
                  key={step.id}
                  title={isDone ? `Review ${step.label}` : `Open ${step.label}`}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors",
                    isActive &&
                      "bg-blue-50 font-medium text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
                    isDone && "text-muted-foreground",
                    !isActive && !isDone && "text-muted-foreground/50"
                  )}
                >
                  {isDone ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                  ) : (
                    <div
                      className={cn(
                        "flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
                        isActive
                          ? "bg-blue-600 text-white"
                          : "border-muted-foreground/30 text-muted-foreground/40 border"
                      )}
                    >
                      {idx + 1}
                    </div>
                  )}
                  <span className="leading-tight">{step.label}</span>
                </button>
              );
            })}
          </aside>

          {/* ── main content ── */}
          <main className="bg-background/90 min-w-0 flex-1 rounded-2xl border p-5 shadow-sm md:p-7">
            {currentStep === 0 && (
              <StepBuild
                saPath={saPath}
                onNext={() => advance(["domain"])}
              />
            )}
            {currentStep === 1 && (
              <StepConnect
                saPath={saPath}
                onNext={() => advance(["business_profile"])}
                onSkip={() => advance()}
              />
            )}
            {currentStep === 2 && (
              <StepCapture
                chosenFunnel={chosenFunnel}
                onChoose={setChosenFunnel}
                saPath={saPath}
                onNext={() => advance(["form"])}
                onSkip={() => advance()}
              />
            )}
            {currentStep === 3 && (
              <StepRespond
                saPath={saPath}
                onNext={() => advance(["automation", "ai"])}
                onSkip={() => advance()}
              />
            )}
            {currentStep === 4 && (
              <StepNurture
                saPath={saPath}
                onNext={() => advance(["pipeline"])}
              />
            )}
            {currentStep === 5 && (
              <StepClose
                completed={completed}
                onFinish={finish}
                finishing={finishing}
                saPath={saPath}
              />
            )}

            {/* ── mobile step indicator ── */}
            <div className="mt-6 flex items-center justify-center gap-1.5 md:hidden">
              {WIZARD_STEPS.map((_, idx) => (
                <div
                  key={idx}
                  className={cn(
                    "h-1.5 rounded-full transition-all",
                    idx === currentStep
                      ? "w-6 bg-blue-500"
                      : idx < currentStep
                        ? "w-3 bg-emerald-400"
                        : "bg-muted w-3"
                  )}
                />
              ))}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   Step 1 — BUILD: Your business profile
   ════════════════════════════════════════════════════════════ */

function StepBuild({
  saPath,
  onNext,
}: {
  saPath: (p: string) => string;
  onNext: () => void;
}) {
  return (
    <StepShell
      icon={<Building2 className="h-6 w-6 text-blue-600" />}
      eyebrow="Step 1: Build · 5 min"
      title="Confirm your domain and hosting foundation"
      subtitle="Your domain and hosting must be established before anything is published. You can still build, preview, and work throughout AgentStack while the connection or transfer is prepared."
    >
      <div className="my-6 grid gap-3 sm:grid-cols-3">
        {[
          {
            icon: <Bot className="h-4 w-4 text-blue-500" />,
            title: "AI Receptionist",
            desc: "Answers every lead using your exact name, brokerage, specialties, and brand voice.",
          },
          {
            icon: <Zap className="h-4 w-4 text-amber-500" />,
            title: "Automations",
            desc: "Speed-to-lead SMS and emails use your details, not generic placeholders.",
          },
          {
            icon: <FileText className="h-4 w-4 text-emerald-500" />,
            title: "Templates",
            desc: "Every email and SMS is pre-personalized with your info before you even send it.",
          },
        ].map((c) => (
          <div
            key={c.title}
            className="border-border bg-card rounded-xl border p-4"
          >
            <div className="bg-muted mb-2 flex h-7 w-7 items-center justify-center rounded-lg">
              {c.icon}
            </div>
            <p className="text-sm font-medium">{c.title}</p>
            <p className="text-muted-foreground mt-0.5 text-xs">{c.desc}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button render={<Link href={saPath("/domain")} />}>
          Set Up Domain &amp; Hosting
          <ArrowRight className="ml-1.5 h-4 w-4" />
        </Button>
        <Button variant="outline" render={<Link href={saPath("/connect")} />}>
          Connect Existing Provider
        </Button>
        <button
          onClick={onNext}
          className="text-muted-foreground text-sm underline-offset-4 hover:underline"
        >
          Foundation saved — continue
        </button>
      </div>

      <div className="mt-6 rounded-xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-900/50 dark:bg-blue-950/20">
        <p className="text-sm font-medium">Connect Google before Blueprint (optional)</p>
        <p className="text-muted-foreground mt-1 text-sm">
          Keep your Google Business Profile, customer reviews, and Workspace/Gmail tools available throughout setup.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            render={<Link href={saPath("/ai-agents/google-business")} />}
          >
            Google profile &amp; reviews
          </Button>
          <Button
            size="sm"
            variant="ghost"
            render={
              <Link
                href={`${saPath("/dashboard/settings")}?tab=messaging#business-email`}
              />
            }
          >
            Workspace &amp; Gmail
          </Button>
        </div>
      </div>

      <TeachingNote>
        AgentStack never asks for provider passwords. Sign in with the domain,
        host, or CRM directly; then return to approve the connection or
        transfer.
      </TeachingNote>
    </StepShell>
  );
}

/* ════════════════════════════════════════════════════════════
   Step 2 — CONNECT: Bring everything together
   ════════════════════════════════════════════════════════════ */

function StepConnect({
  saPath,
  onNext,
  onSkip,
}: {
  saPath: (p: string) => string;
  onNext: () => void;
  onSkip: () => void;
}) {
  return (
    <StepShell
      icon={<Link2 className="h-6 w-6 text-violet-600" />}
      eyebrow="Step 2: Blueprint · 3 min"
      title="Approve the essential facts Zack needs"
      subtitle="Name, brokerage, contact method, service area, services, client promise, website, and compliance are enough for 100%. Everything else is optional enrichment you can add as you go."
    >
      <div className="my-6 grid gap-3 sm:grid-cols-2">
        <ConnectOptionCard
          icon={<Upload className="h-5 w-5 text-violet-500" />}
          title="Essential Business Blueprint"
          description="Review only the facts AgentStack needs to personalize the workspace safely."
          href={saPath("/business-profile?from=wizard")}
          cta="Review Essentials"
        />
        <ConnectOptionCard
          icon={<Users className="h-5 w-5 text-blue-500" />}
          title="Google profile assistant"
          description="Use approved Blueprint facts to prepare an indexing-friendly Google profile."
          href={saPath("/ai-agents/google-business")}
          cta="Build Google Profile"
        />
        <ConnectOptionCard
          icon={<Phone className="h-5 w-5 text-emerald-500" />}
          title="Connect your phone"
          description="Link a dedicated Twilio number so you can send and receive SMS — and your AI can reply on your behalf."
          href={saPath(SUB_ACCOUNT_ROUTES.messagingSettings)}
          cta="SMS Settings"
        />
        <ConnectOptionCard
          icon={<Bot className="h-5 w-5 text-amber-500" />}
          title="More connections"
          description="Email, calendar, website, and social accounts can all be connected later from Settings."
          href={saPath("/connect")}
          cta="Open Connections"
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={onNext}>
          Continue
          <ArrowRight className="ml-1.5 h-4 w-4" />
        </Button>
        <button
          onClick={onSkip}
          className="text-muted-foreground text-sm underline-offset-4 hover:underline"
        >
          Skip — I&apos;ll connect later
        </button>
      </div>

      <TeachingNote>
        Already using GoHighLevel, Follow Up Boss, kvCORE, or another CRM?
        Export your contacts as a CSV and upload here. The importer handles
        duplicate detection automatically. Connecting your phone number is what
        powers AI SMS responses — your agent can start answering leads the
        moment you flip the switch. One thing carriers require before texts
        deliver reliably: A2P 10DLC registration. It&apos;s a self-service
        form — business details, sample messages, submission tracking —
        sitting right below your Twilio setup in SMS Settings. Do it as soon
        as your number is connected; carrier review can take several days.
      </TeachingNote>
    </StepShell>
  );
}

function ConnectOptionCard({
  icon,
  title,
  description,
  href,
  cta,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  href: string;
  cta: string;
}) {
  return (
    <div className="border-border bg-card flex flex-col gap-3 rounded-xl border p-5">
      <div className="bg-muted flex h-9 w-9 items-center justify-center rounded-lg">
        {icon}
      </div>
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="text-muted-foreground mt-1 text-xs">{description}</p>
      </div>
      <Button
        size="sm"
        variant="outline"
        render={<Link href={href} />}
        className="mt-auto w-fit"
      >
        {cta}
        <ChevronRight className="ml-1 h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   Step 3 — CAPTURE: Build your lead capture systems
   ════════════════════════════════════════════════════════════ */

function StepCapture({
  chosenFunnel,
  onChoose,
  saPath,
  onNext,
  onSkip,
}: {
  chosenFunnel: string | null;
  onChoose: (id: string) => void;
  saPath: (p: string) => string;
  onNext: () => void;
  onSkip: () => void;
}) {
  return (
    <StepShell
      icon={<Target className="h-6 w-6 text-amber-500" />}
      eyebrow="Step 3: Capture · 3 min"
      title="Create your Lead Capture Systems"
      subtitle="These are the places where leads enter your business — forms on your website, landing pages, booking pages. Pick a ready-made system below. Every submission auto-creates a contact and drops them into your pipeline."
    >
      <div className="my-6 flex flex-col gap-3">
        {FUNNEL_RECOMMENDATIONS.map((funnel) => (
          <button
            key={funnel.id}
            onClick={() => onChoose(funnel.id)}
            className={cn(
              "flex items-start gap-4 rounded-xl border p-4 text-left transition-all",
              chosenFunnel === funnel.id
                ? "border-blue-500 bg-blue-50 dark:border-blue-700 dark:bg-blue-950/30"
                : "border-border bg-card hover:border-muted-foreground/30"
            )}
          >
            <div
              className={cn(
                "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                chosenFunnel === funnel.id
                  ? "border-blue-500 bg-blue-500"
                  : "border-muted-foreground/30"
              )}
            >
              {chosenFunnel === funnel.id && (
                <div className="h-2 w-2 rounded-full bg-white" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">{funnel.title}</span>
                {funnel.badge && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                    {funnel.badge}
                  </span>
                )}
              </div>
              <p className="text-muted-foreground mt-0.5 text-xs">
                {funnel.description}
              </p>
            </div>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          render={<Link href={saPath("/forms")} />}
          disabled={!chosenFunnel}
          onClick={onNext}
        >
          Build my capture system
          <ArrowRight className="ml-1.5 h-4 w-4" />
        </Button>
        <button
          onClick={onSkip}
          className="text-muted-foreground text-sm underline-offset-4 hover:underline"
        >
          Skip — I&apos;ll set this up later
        </button>
      </div>

      <TeachingNote>
        Every lead capture system is built on two things: a Form (the page where
        leads give you their info) and an instant AI response (the follow-up
        that fires within 60 seconds). AgentStack pre-configures both — you just
        review and activate. The whole thing takes about 3 minutes.
      </TeachingNote>
    </StepShell>
  );
}

/* ════════════════════════════════════════════════════════════
   Step 4 — RESPOND: Enable instant AI response
   ════════════════════════════════════════════════════════════ */

function StepRespond({
  saPath,
  onNext,
  onSkip,
}: {
  saPath: (p: string) => string;
  onNext: () => void;
  onSkip: () => void;
}) {
  return (
    <StepShell
      icon={<Zap className="h-6 w-6 text-indigo-600" />}
      eyebrow="Step 4: Respond · 3 min"
      title="Enable instant AI response"
      subtitle="This is where AgentStack earns its keep. You don't build automations — you enable them. Your AI agent is already pre-configured with your Business Profile. It responds to every lead within 60 seconds across SMS, web chat, and more."
    >
      <div className="my-6 grid gap-3 sm:grid-cols-2">
        {[
          {
            icon: <Zap className="h-5 w-5 text-amber-500" />,
            title: "Speed-to-Lead",
            description:
              "Every new form submission gets an SMS and email within 60 seconds — automatically. The first agent to respond wins 78% of the time.",
            badge: "Activate in 1 click",
            badgeColor: "emerald",
          },
          {
            icon: <Bot className="h-5 w-5 text-indigo-500" />,
            title: "AI Receptionist",
            description:
              "Your AI agent handles inbound texts and web chat 24/7. It reads your Business Profile, qualifies leads, and books callbacks.",
            badge: "Pre-configured",
            badgeColor: "blue",
          },
        ].map((card) => (
          <div
            key={card.title}
            className="border-border bg-card rounded-xl border p-5"
          >
            <div className="bg-muted mb-3 flex h-9 w-9 items-center justify-center rounded-lg">
              {card.icon}
            </div>
            <div className="mb-2 flex items-start justify-between gap-2">
              <p className="text-sm font-medium">{card.title}</p>
              <span
                className={cn(
                  "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium",
                  card.badgeColor === "emerald"
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                    : "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
                )}
              >
                {card.badge}
              </span>
            </div>
            <p className="text-muted-foreground text-xs">{card.description}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          render={<Link href={saPath(SUB_ACCOUNT_ROUTES.workflows)} />}
          onClick={onNext}
        >
          Enable Speed-to-Lead
          <ArrowRight className="ml-1.5 h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          render={<Link href={saPath("/ai-agents")} />}
          onClick={onNext}
        >
          Review AI Agent
        </Button>
        <button
          onClick={onSkip}
          className="text-muted-foreground text-sm underline-offset-4 hover:underline"
        >
          Skip for now
        </button>
      </div>

      <TeachingNote>
        Speed-to-Lead is already wired to your lead capture forms. Just enable
        it and every new inquiry fires an SMS + email automatically. Your AI
        agent reads your Business Profile so it already knows your name,
        brokerage, service areas, and brand voice — review the persona, flip the
        toggle, and go live. No configuration required.
      </TeachingNote>
    </StepShell>
  );
}

/* ════════════════════════════════════════════════════════════
   Step 5 — NURTURE: Automatic follow-up
   ════════════════════════════════════════════════════════════ */

function StepNurture({
  saPath,
  onNext,
}: {
  saPath: (p: string) => string;
  onNext: () => void;
}) {
  return (
    <StepShell
      icon={<TrendingUp className="h-6 w-6 text-emerald-600" />}
      eyebrow="Step 5: Nurture · 2 min"
      title="Your follow-up runs itself"
      subtitle="Every lead that enters your system gets automatic follow-up until they reply. Your pipeline tracks every opportunity from first contact to closing. Nothing falls through the cracks."
    >
      <div className="my-6 grid gap-3 sm:grid-cols-2">
        <div className="border-border bg-card rounded-xl border p-5">
          <div className="bg-muted mb-3 flex h-9 w-9 items-center justify-center rounded-lg">
            <TrendingUp className="h-5 w-5 text-emerald-500" />
          </div>
          <p className="text-sm font-medium">Your Pipeline</p>
          <p className="text-muted-foreground mt-1 text-xs">
            Pre-set for real estate: New Lead &rarr; Contacted &rarr; Showing
            Scheduled &rarr; Offer Made &rarr; Closed. Drag deals as they
            progress. Customize stages anytime.
          </p>
        </div>
        <div className="border-border bg-card rounded-xl border p-5">
          <div className="bg-muted mb-3 flex h-9 w-9 items-center justify-center rounded-lg">
            <Sparkles className="h-5 w-5 text-violet-500" />
          </div>
          <p className="text-sm font-medium">Automatic Follow-up</p>
          <p className="text-muted-foreground mt-1 text-xs">
            Your AI agent continues the conversation. Leads get follow-up
            messages until they reply, book a showing, or opt out. Everything is
            pre-written and pre-scheduled.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button render={<Link href={saPath("/pipeline")} />} onClick={onNext}>
          Review Pipeline
          <ArrowRight className="ml-1.5 h-4 w-4" />
        </Button>
        <button
          onClick={onNext}
          className="text-muted-foreground text-sm underline-offset-4 hover:underline"
        >
          Looks good — continue
        </button>
      </div>

      <TeachingNote>
        Most agents lose deals not because they lack leads, but because
        follow-up stops. AgentStack handles the nurture automatically — your AI
        texts, your pipeline tracks, and your dashboard shows you exactly who
        needs attention today. You just show up and close.
      </TeachingNote>
    </StepShell>
  );
}

/* ════════════════════════════════════════════════════════════
   Step 6 — CLOSE: You're ready
   ════════════════════════════════════════════════════════════ */

function StepClose({
  completed,
  onFinish,
  finishing,
  saPath,
}: {
  completed: Set<string>;
  onFinish: () => Promise<void>;
  finishing: boolean;
  saPath: (p: string) => string;
}) {
  const doneCount = ONBOARDING_STEP_IDS.filter((id) =>
    completed.has(id)
  ).length;
  const totalCount = ONBOARDING_STEP_IDS.length;
  const remaining = ONBOARDING_STEPS.filter(
    (step) => !completed.has(step.id),
  );
  const requiredRemaining = remaining.filter(
    (step) => !OPTIONAL_ONBOARDING_STEP_IDS.includes(step.id),
  );
  const optionalRemaining = remaining.filter((step) =>
    OPTIONAL_ONBOARDING_STEP_IDS.includes(step.id),
  );

  return (
    <StepShell
      icon={<Star className="h-6 w-6 text-amber-500" />}
      eyebrow="Step 6: Start your first working day"
      title={
        requiredRemaining.length === 0
          ? "Your workspace is ready. Here is what happens next."
          : "Almost there — here is what is still missing."
      }
      subtitle={`${AGENTSTACK_METHOD_NAME} is now configured. Enter Today to see one recommended action, confirm your website foundation, and test the lead-to-appointment workflow before inviting real leads.`}
    >
      <div className="my-6 rounded-xl border border-emerald-200 bg-emerald-50/60 p-5 dark:border-emerald-800/40 dark:bg-emerald-950/20">
        <div className="mb-3 flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-emerald-500" />
          <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
            {doneCount} of {totalCount} setup steps complete
          </p>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-emerald-100 dark:bg-emerald-900/40">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all"
            style={{ width: `${(doneCount / totalCount) * 100}%` }}
          />
        </div>
      </div>

      {/*
        Name what is left, with a link to each. The old copy said "you can
        finish the remaining steps any time from your workspace checklist" —
        which leaves someone who has never used a CRM to work out what is
        missing and where it lives. Two steps (importing contacts and
        connecting a phone number) are never completed by this wizard at all,
        so for most agents this list is never empty.
      */}
      {requiredRemaining.length > 0 ? (
        <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <p className="text-sm font-semibold text-amber-950">
            {requiredRemaining.length} {requiredRemaining.length === 1 ? "step" : "steps"} still to do
          </p>
          <p className="mt-1 text-xs leading-5 text-amber-900/80">
            None of these are done yet. Each one takes a few minutes — start
            wherever you like.
          </p>
          <div className="mt-4 space-y-2">
            {requiredRemaining.map((step) => (
              <div
                key={step.id}
                className="flex flex-col gap-3 rounded-xl border bg-white p-3 sm:flex-row sm:items-center"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{step.title}</p>
                  <p className="text-muted-foreground mt-0.5 text-xs leading-5">
                    {step.description}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  render={<Link href={saPath(step.href)} />}
                >
                  {step.cta} <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {optionalRemaining.length > 0 ? (
        <div className="mb-6 rounded-2xl border border-blue-200 bg-blue-50/70 p-5">
          <p className="text-sm font-semibold text-blue-950">
            Optional setup — revisit anytime
          </p>
          <p className="mt-1 text-xs leading-5 text-blue-900/80">
            These items need your own phone approval or personal AI preferences.
            They do not block access to your workspace.
          </p>
          <div className="mt-4 space-y-2">
            {optionalRemaining.map((step) => (
              <div
                key={step.id}
                className="flex flex-col gap-3 rounded-xl border bg-white p-3 sm:flex-row sm:items-center"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{step.title}</p>
                  <p className="text-muted-foreground mt-0.5 text-xs leading-5">
                    {step.description}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  render={<Link href={saPath(step.href)} />}
                >
                  {step.cta} <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mb-6 rounded-2xl border bg-[#f7faff] p-5">
        <p className="text-xs font-semibold tracking-widest text-[#DB4F9B] uppercase">
          Your first 10 minutes
        </p>
        <div className="mt-4 space-y-3">
          {[
            "Review the single next action on Today",
            "Confirm Site Health shows the domain and hosting status",
            "Send one test lead through your form and verify the follow-up",
          ].map((item, index) => (
            <div key={item} className="flex items-start gap-3 text-sm">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#173B7A] text-xs font-semibold text-white">
                {index + 1}
              </span>
              <span className="pt-0.5">{item}</span>
            </div>
          ))}
        </div>
      </div>

      <Button size="lg" onClick={() => void onFinish()} disabled={finishing}>
        {finishing ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <HeartPulse className="mr-2 h-4 w-4" />
        )}
        {finishing ? "Opening Today…" : "Go to Today — show my next action"}
        {!finishing ? <ArrowRight className="ml-1.5 h-4 w-4" /> : null}
      </Button>
      <p className="text-muted-foreground mt-3 text-xs">
        Setup will close automatically. You can return to any setting from the
        sidebar.
      </p>
    </StepShell>
  );
}

/* ════════════════════════════════════════════════════════════
   Shared layout primitives
   ════════════════════════════════════════════════════════════ */

function StepShell({
  icon,
  eyebrow,
  title,
  subtitle,
  children,
}: {
  icon: React.ReactNode;
  eyebrow: string;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <div className="bg-muted mb-4 flex h-12 w-12 items-center justify-center rounded-2xl">
          {icon}
        </div>
        <p className="text-muted-foreground mb-1.5 text-xs font-medium tracking-wider uppercase">
          {eyebrow}
        </p>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        <p className="text-muted-foreground mt-2 leading-relaxed">{subtitle}</p>
      </div>
      {children}
    </div>
  );
}

function TeachingNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-border bg-muted/30 mt-6 flex gap-3 rounded-xl border px-4 py-3">
      <Sparkles className="text-muted-foreground mt-0.5 h-4 w-4 shrink-0" />
      <p className="text-muted-foreground text-xs leading-relaxed">
        {children}
      </p>
    </div>
  );
}
