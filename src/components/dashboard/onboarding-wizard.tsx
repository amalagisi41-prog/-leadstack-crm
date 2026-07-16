"use client";

import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ONBOARDING_STEP_IDS } from "@/lib/onboarding/steps";
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
    label: "Business Profile",
    icon: Building2,
    tagline: "Your business profile",
  },
  {
    id: "connect" as const,
    label: "Import Contacts",
    icon: Link2,
    tagline: "Bring everything together",
  },
  {
    id: "capture" as const,
    label: "Connect Business",
    icon: Target,
    tagline: "Lead capture systems",
  },
  {
    id: "respond" as const,
    label: "Choose Goals",
    icon: Zap,
    tagline: "Instant AI response",
  },
  {
    id: "nurture" as const,
    label: "Launch Marketing",
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
    description: "Capture buyer inquiries 24/7. AI follows up within 60 seconds.",
    badge: "Most popular",
  },
  {
    id: "seller_valuation",
    title: "Home Valuation Request",
    description: "Sellers request a free home value estimate. AI qualifies them immediately.",
    badge: "High intent",
  },
  {
    id: "open_house",
    title: "Open House Sign-in",
    description: "Digital sign-in sheet. AI texts attendees within minutes of leaving.",
    badge: "",
  },
];

/* ---------- persist helper ---------- */

async function persistSteps(subAccountId: string, steps: string[]) {
  await fetch(`/api/sub-accounts/${subAccountId}/onboarding`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ steps }),
  }).catch(() => {});
}

/* ---------- main component ---------- */

export function OnboardingWizard({
  subAccountId,
  saPath,
  initialCompleted,
  initialStep,
}: WizardProps) {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState<WizardStep>(
    () =>
      initialStep
        ? WIZARD_STEP_INDEX[initialStep]
        : ((computeOnboardingState(initialCompleted).nextWizardStepIndex ??
            5) as WizardStep),
  );
  const [completed, setCompleted] = useState<Set<string>>(
    () => new Set(initialCompleted),
  );
  const [chosenFunnel, setChosenFunnel] = useState<string | null>(null);

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
    [subAccountId],
  );

  const advance = useCallback(
    (idsToMark: string[] = []) => {
      if (idsToMark.length) markDone(idsToMark);
      setCurrentStep((s) => Math.min(s + 1, 5) as WizardStep);
    },
    [markDone],
  );

  const finish = useCallback(() => {
    const all = [...ONBOARDING_STEP_IDS];
    markDone(all);
    router.replace(saPath("/dashboard"));
  }, [markDone, router, saPath]);

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col bg-gradient-to-b from-[#fff8ee] to-background">
      {/* ── top progress bar ── */}
      <div className="h-1 w-full bg-muted">
        <div
          className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-500"
          style={{ width: `${((currentStep + 1) / 6) * 100}%` }}
        />
      </div>

      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-5 p-4 md:p-8">
        <div className="flex flex-col justify-between gap-3 rounded-2xl border bg-white/80 px-5 py-4 shadow-sm backdrop-blur sm:flex-row sm:items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#DB4F9B]">Your 15-minute business launch</p>
            <h1 className="mt-1 text-xl font-semibold tracking-tight text-[#173B7A]">We&apos;ll build the system. You approve what goes live.</h1>
          </div>
          <div className="rounded-full bg-[#173B7A]/5 px-3 py-1.5 text-xs font-medium text-[#173B7A]">Step {currentStep + 1} of 6</div>
        </div>

        <div className="flex flex-1 gap-0 md:gap-8">
        {/* ── left sidebar — The AgentStack Method™ ── */}
        <aside className="hidden md:flex flex-col gap-1 w-52 shrink-0 pt-2">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {AGENTSTACK_METHOD_NAME}
          </p>
          {WIZARD_STEPS.map((step, idx) => {
            const isActive = idx === currentStep;
            const isDone = idx < currentStep;
            return (
              <div
                key={step.id}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
                  isActive && "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 font-medium",
                  isDone && "text-muted-foreground",
                  !isActive && !isDone && "text-muted-foreground/50",
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
                        : "border border-muted-foreground/30 text-muted-foreground/40",
                    )}
                  >
                    {idx + 1}
                  </div>
                )}
                <span className="leading-tight">{step.label}</span>
              </div>
            );
          })}
        </aside>

        {/* ── main content ── */}
        <main className="min-w-0 flex-1 rounded-2xl border bg-background/90 p-5 shadow-sm md:p-7">
          {currentStep === 0 && (
            <StepBuild saPath={saPath} onNext={() => advance(["business_profile"])} />
          )}
          {currentStep === 1 && (
            <StepConnect saPath={saPath} onNext={() => advance(["contacts", "sms"])} onSkip={() => advance(["contacts", "sms"])} />
          )}
          {currentStep === 2 && (
            <StepCapture
              chosenFunnel={chosenFunnel}
              onChoose={setChosenFunnel}
              saPath={saPath}
              onNext={() => advance(["form"])}
              onSkip={() => advance(["form"])}
            />
          )}
          {currentStep === 3 && (
            <StepRespond saPath={saPath} onNext={() => advance(["automation", "ai"])} onSkip={() => advance(["automation", "ai"])} />
          )}
          {currentStep === 4 && (
            <StepNurture saPath={saPath} onNext={() => advance(["pipeline"])} />
          )}
          {currentStep === 5 && (
            <StepClose
              completed={completed}
              saPath={saPath}
              onFinish={finish}
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
                      : "w-3 bg-muted",
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
      title="Build your business profile"
      subtitle="This is the foundation of everything. You tell AgentStack about your business once — name, brokerage, services, brand voice, compliance rules, and FAQs. Every AI agent, email, SMS template, and automation pulls from this profile automatically. Set it once, and everything else just works."
    >
      <div className="grid gap-3 sm:grid-cols-3 my-6">
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
          <div key={c.title} className="rounded-xl border border-border bg-card p-4">
            <div className="mb-2 flex h-7 w-7 items-center justify-center rounded-lg bg-muted">
              {c.icon}
            </div>
            <p className="text-sm font-medium">{c.title}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{c.desc}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button render={<Link href={saPath("/business-profile?from=wizard")} />}>
          Set Up Business Profile
          <ArrowRight className="ml-1.5 h-4 w-4" />
        </Button>
        <button
          onClick={onNext}
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          I&apos;ll do this later
        </button>
      </div>

      <TeachingNote>
        Think of your Business Profile as your single source of truth
        that feeds every feature in AgentStack. You don&apos;t have to fill everything in right now.
        Even your name, brokerage, and service areas make a big difference. You can always come back
        to add FAQs, brand voice, and compliance rules later.
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
      eyebrow="Step 2: Connect · 5 min"
      title="Bring everything together"
      subtitle="Import your existing contacts and connect your phone number. These two connections unlock AI-powered SMS follow-up, automated responses, and a full communication history for every lead."
    >
      <div className="grid gap-3 sm:grid-cols-2 my-6">
        <ConnectOptionCard
          icon={<Upload className="h-5 w-5 text-violet-500" />}
          title="Import contacts"
          description="Upload a CSV from your old CRM. AgentStack maps columns automatically and handles duplicate detection."
          href={saPath("/contacts?import=1")}
          cta="Upload CSV"
        />
        <ConnectOptionCard
          icon={<Users className="h-5 w-5 text-blue-500" />}
          title="Add manually"
          description="Got a handful of leads? Add them one by one from the Contacts page to get started."
          href={saPath("/contacts")}
          cta="Go to Contacts"
        />
        <ConnectOptionCard
          icon={<Phone className="h-5 w-5 text-emerald-500" />}
          title="Connect your phone"
          description="Link a dedicated Twilio number so you can send and receive SMS — and your AI can reply on your behalf."
          href={saPath("/dashboard/settings?tab=sms")}
          cta="SMS Settings"
        />
        <ConnectOptionCard
          icon={<Bot className="h-5 w-5 text-amber-500" />}
          title="More connections"
          description="Email, calendar, website, and social accounts can all be connected later from Settings."
          href={saPath("/dashboard/settings")}
          cta="View Settings"
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={onNext}>
          Continue
          <ArrowRight className="ml-1.5 h-4 w-4" />
        </Button>
        <button
          onClick={onSkip}
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          Skip — I&apos;ll connect later
        </button>
      </div>

      <TeachingNote>
        Already using GoHighLevel, Follow Up Boss, kvCORE, or another CRM? Export your contacts
        as a CSV and upload here. The importer handles duplicate detection automatically. Connecting
        your phone number is what powers AI SMS responses — your agent can start answering leads the
        moment you flip the switch.
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
    <div className="rounded-xl border border-border bg-card p-5 flex flex-col gap-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
        {icon}
      </div>
      <div>
        <p className="font-medium text-sm">{title}</p>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      </div>
      <Button size="sm" variant="outline" render={<Link href={href} />} className="mt-auto w-fit">
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
      <div className="flex flex-col gap-3 my-6">
        {FUNNEL_RECOMMENDATIONS.map((funnel) => (
          <button
            key={funnel.id}
            onClick={() => onChoose(funnel.id)}
            className={cn(
              "flex items-start gap-4 rounded-xl border p-4 text-left transition-all",
              chosenFunnel === funnel.id
                ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-700"
                : "border-border bg-card hover:border-muted-foreground/30",
            )}
          >
            <div
              className={cn(
                "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                chosenFunnel === funnel.id
                  ? "border-blue-500 bg-blue-500"
                  : "border-muted-foreground/30",
              )}
            >
              {chosenFunnel === funnel.id && (
                <div className="h-2 w-2 rounded-full bg-white" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-sm">{funnel.title}</span>
                {funnel.badge && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                    {funnel.badge}
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
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
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          Skip — I&apos;ll set this up later
        </button>
      </div>

      <TeachingNote>
        Every lead capture system is built on two things: a Form (the page where leads give you
        their info) and an instant AI response (the follow-up that fires within 60 seconds).
        AgentStack pre-configures both — you just review and activate. The whole thing takes
        about 3 minutes.
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
      <div className="grid gap-3 sm:grid-cols-2 my-6">
        {[
          {
            icon: <Zap className="h-5 w-5 text-amber-500" />,
            title: "Speed-to-Lead",
            description: "Every new form submission gets an SMS and email within 60 seconds — automatically. The first agent to respond wins 78% of the time.",
            badge: "Activate in 1 click",
            badgeColor: "emerald",
          },
          {
            icon: <Bot className="h-5 w-5 text-indigo-500" />,
            title: "AI Receptionist",
            description: "Your AI agent handles inbound texts and web chat 24/7. It reads your Business Profile, qualifies leads, and books callbacks.",
            badge: "Pre-configured",
            badgeColor: "blue",
          },
        ].map((card) => (
          <div key={card.title} className="rounded-xl border border-border bg-card p-5">
            <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
              {card.icon}
            </div>
            <div className="flex items-start justify-between gap-2 mb-2">
              <p className="text-sm font-medium">{card.title}</p>
              <span
                className={cn(
                  "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium",
                  card.badgeColor === "emerald"
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                    : "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
                )}
              >
                {card.badge}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">{card.description}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button render={<Link href={saPath("/automations")} />} onClick={onNext}>
          Enable Speed-to-Lead
          <ArrowRight className="ml-1.5 h-4 w-4" />
        </Button>
        <Button variant="outline" render={<Link href={saPath("/ai-agents")} />} onClick={onNext}>
          Review AI Agent
        </Button>
        <button
          onClick={onSkip}
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          Skip for now
        </button>
      </div>

      <TeachingNote>
        Speed-to-Lead is already wired to your lead capture forms. Just enable it and every new
        inquiry fires an SMS + email automatically. Your AI agent reads your Business Profile so it
        already knows your name, brokerage, service areas, and brand voice — review the persona,
        flip the toggle, and go live. No configuration required.
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
      <div className="grid gap-3 sm:grid-cols-2 my-6">
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
            <TrendingUp className="h-5 w-5 text-emerald-500" />
          </div>
          <p className="text-sm font-medium">Your Pipeline</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Pre-set for real estate: New Lead &rarr; Contacted &rarr; Showing Scheduled &rarr;
            Offer Made &rarr; Closed. Drag deals as they progress. Customize stages anytime.
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
            <Sparkles className="h-5 w-5 text-violet-500" />
          </div>
          <p className="text-sm font-medium">Automatic Follow-up</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Your AI agent continues the conversation. Leads get follow-up messages until they
            reply, book a showing, or opt out. Everything is pre-written and pre-scheduled.
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
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          Looks good — continue
        </button>
      </div>

      <TeachingNote>
        Most agents lose deals not because they lack leads, but because follow-up stops. AgentStack
        handles the nurture automatically — your AI texts, your pipeline tracks, and your dashboard
        shows you exactly who needs attention today. You just show up and close.
      </TeachingNote>
    </StepShell>
  );
}

/* ════════════════════════════════════════════════════════════
   Step 6 — CLOSE: You're ready
   ════════════════════════════════════════════════════════════ */

function StepClose({
  completed,
  saPath,
  onFinish,
}: {
  completed: Set<string>;
  saPath: (p: string) => string;
  onFinish: () => void;
}) {
  const doneCount = ONBOARDING_STEP_IDS.filter((id) => completed.has(id)).length;
  const totalCount = ONBOARDING_STEP_IDS.length;

  return (
    <StepShell
      icon={<Star className="h-6 w-6 text-amber-500" />}
      eyebrow="Step 6: Close"
      title="Your system is ready"
      subtitle={`Build. Connect. Capture. Respond. Nurture. Close. That's ${AGENTSTACK_METHOD_NAME} — and you just set it up. Your AI receptionist is standing by, your pipeline is live, and every new lead gets instant follow-up.`}
    >
      <div className="my-6 rounded-xl border border-emerald-200 bg-emerald-50/60 dark:border-emerald-800/40 dark:bg-emerald-950/20 p-5">
        <div className="flex items-center gap-2 mb-3">
          <CheckCircle2 className="h-5 w-5 text-emerald-500" />
          <p className="font-medium text-sm text-emerald-700 dark:text-emerald-400">
            {doneCount} of {totalCount} setup steps complete
          </p>
        </div>
        <div className="h-1.5 w-full rounded-full bg-emerald-100 dark:bg-emerald-900/40 overflow-hidden">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all"
            style={{ width: `${(doneCount / totalCount) * 100}%` }}
          />
        </div>
        {doneCount < totalCount && (
          <p className="mt-2 text-xs text-emerald-600 dark:text-emerald-500">
            You can finish the remaining steps any time from your workspace checklist.
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 mb-6">
        {[
          { label: "View Contacts", href: saPath("/contacts") },
          { label: "Open Pipeline", href: saPath("/pipeline") },
          { label: "AI Agents", href: saPath("/ai-agents") },
          { label: "Forms", href: saPath("/forms") },
        ].map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3 text-sm font-medium hover:bg-muted/50 transition-colors"
          >
            {link.label}
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </Link>
        ))}
      </div>

      <Button size="lg" onClick={onFinish}>
        Open Workspace
        <ArrowRight className="ml-1.5 h-4 w-4" />
      </Button>
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
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
          {icon}
        </div>
        <p className="mb-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {eyebrow}
        </p>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        <p className="mt-2 text-muted-foreground leading-relaxed">{subtitle}</p>
      </div>
      {children}
    </div>
  );
}

function TeachingNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-6 flex gap-3 rounded-xl border border-border bg-muted/30 px-4 py-3">
      <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <p className="text-xs text-muted-foreground leading-relaxed">{children}</p>
    </div>
  );
}
