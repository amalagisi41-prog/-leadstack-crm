"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BookOpen,
  Users,
  Target,
  Zap,
  Bot,
  CheckCircle2,
  ArrowRight,
  Upload,
  FileText,
  Star,
  Sparkles,
  Home,
  Building2,
  TrendingUp,
  UserCheck,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SERVICE_SPECIALTIES } from "@/types/business-profile";
import { ONBOARDING_STEP_IDS } from "@/lib/onboarding/steps";

/* ---------- types ---------- */

type WizardStep = 0 | 1 | 2 | 3 | 4 | 5;

interface WizardProps {
  subAccountId: string;
  saPath: (p: string) => string;
  /** Already-completed step IDs (hydrated from Firestore). */
  initialCompleted: string[];
}

/* ---------- step metadata ---------- */

const WIZARD_STEPS = [
  {
    id: "business_profile" as const,
    label: "Business Profile",
    icon: BookOpen,
    tagline: "Tell AgentStack about your business",
  },
  {
    id: "contacts" as const,
    label: "Import Contacts",
    icon: Users,
    tagline: "Bring your existing leads",
  },
  {
    id: "goals" as const,
    label: "Choose Your Goals",
    icon: Target,
    tagline: "Pick what matters most to you",
  },
  {
    id: "marketing" as const,
    label: "Launch Marketing",
    icon: Zap,
    tagline: "Set up your lead capture funnel",
  },
  {
    id: "ai_setup" as const,
    label: "AI Setup",
    icon: Bot,
    tagline: "Activate your AI receptionist",
  },
  {
    id: "done" as const,
    label: "You're Ready",
    icon: Star,
    tagline: "Start closing deals",
  },
] as const;

/* ---------- goal chips ---------- */

const GOAL_OPTIONS: { id: string; label: string; icon: React.ElementType }[] = [
  { id: "buyers", label: "Work with Buyers", icon: Home },
  { id: "sellers", label: "List & Sell Homes", icon: Building2 },
  { id: "investors", label: "Investor Deals", icon: TrendingUp },
  { id: "first_time_buyers", label: "First-Time Buyers", icon: UserCheck },
  { id: "rentals", label: "Rentals", icon: FileText },
  { id: "luxury", label: "Luxury Market", icon: Sparkles },
];

/* ---------- recommended funnel cards ---------- */

const FUNNEL_RECOMMENDATIONS = [
  {
    id: "buyer_lead_form",
    title: "Buyer Lead Form",
    description: "Capture buyer inquiries 24/7. AI follows up within 60 seconds.",
    badge: "Most popular",
    stepsMarked: ["form", "automation"] as const,
  },
  {
    id: "seller_valuation",
    title: "Home Valuation Request",
    description: "Sellers request a free home value estimate. AI qualifies them immediately.",
    badge: "High intent",
    stepsMarked: ["form", "automation"] as const,
  },
  {
    id: "open_house",
    title: "Open House Sign-in",
    description: "Digital sign-in sheet. AI texts attendees within minutes of leaving.",
    badge: "",
    stepsMarked: ["form", "automation"] as const,
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
}: WizardProps) {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState<WizardStep>(0);
  const [completed, setCompleted] = useState<Set<string>>(
    () => new Set(initialCompleted),
  );
  const [selectedGoals, setSelectedGoals] = useState<Set<string>>(new Set());
  const [chosenFunnel, setChosenFunnel] = useState<string | null>(null);

  /* mark step IDs as done and persist */
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

  /* finish — mark everything remaining, redirect to dashboard */
  const finish = useCallback(() => {
    const all = [...ONBOARDING_STEP_IDS];
    markDone(all);
    router.replace(saPath("/dashboard"));
  }, [markDone, router, saPath]);

  const toggleGoal = (id: string) =>
    setSelectedGoals((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col">
      {/* ── top progress bar ── */}
      <div className="h-1 w-full bg-muted">
        <div
          className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-500"
          style={{ width: `${((currentStep + 1) / 6) * 100}%` }}
        />
      </div>

      <div className="flex flex-1 gap-0 md:gap-8 p-4 md:p-8 max-w-6xl mx-auto w-full">
        {/* ── left sidebar ── */}
        <aside className="hidden md:flex flex-col gap-1 w-52 shrink-0 pt-2">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Setup — 15 min
          </p>
          {WIZARD_STEPS.map((step, idx) => {
            const Icon = step.icon;
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
        <main className="flex-1 min-w-0">
          {currentStep === 0 && (
            <StepBusinessProfile saPath={saPath} onNext={() => advance(["business_profile"])} />
          )}
          {currentStep === 1 && (
            <StepImportContacts saPath={saPath} onNext={() => advance(["contacts"])} onSkip={() => advance(["contacts"])} />
          )}
          {currentStep === 2 && (
            <StepChooseGoals
              selectedGoals={selectedGoals}
              onToggle={toggleGoal}
              onNext={() => advance()}
            />
          )}
          {currentStep === 3 && (
            <StepLaunchMarketing
              chosenFunnel={chosenFunnel}
              onChoose={setChosenFunnel}
              saPath={saPath}
              onNext={() => advance(["form", "automation"])}
              onSkip={() => advance(["form", "automation"])}
            />
          )}
          {currentStep === 4 && (
            <StepAISetup saPath={saPath} onNext={() => advance(["ai"])} onSkip={() => advance(["ai"])} />
          )}
          {currentStep === 5 && (
            <StepDone
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
  );
}

/* ════════════════════════════════════════════════════════════
   Step 1 — Business Profile
   ════════════════════════════════════════════════════════════ */

function StepBusinessProfile({
  saPath,
  onNext,
}: {
  saPath: (p: string) => string;
  onNext: () => void;
}) {
  return (
    <StepShell
      icon={<BookOpen className="h-6 w-6 text-blue-600" />}
      eyebrow="Step 1 of 6 · 5 min"
      title="Set up your Business Profile"
      subtitle="This is the most important step. Everything else in AgentStack references this information — your AI receptionist, email templates, SMS follow-ups, and lead funnels all pull from it automatically."
    >
      {/* teaching cards */}
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
          I'll do this later
        </button>
      </div>

      <TeachingNote>
        You don't have to fill everything in right now — even your name, brokerage, and
        service areas make a big difference. You can always come back to add FAQs, brand voice,
        and compliance rules. Once saved, click the "Continue setup" button on that page to come back
        here.
      </TeachingNote>
    </StepShell>
  );
}

/* ════════════════════════════════════════════════════════════
   Step 2 — Import Contacts
   ════════════════════════════════════════════════════════════ */

function StepImportContacts({
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
      icon={<Users className="h-6 w-6 text-violet-600" />}
      eyebrow="Step 2 of 6 · 3 min"
      title="Bring your contacts"
      subtitle="Upload a CSV from your old CRM, or add a few contacts manually to start. Every contact you add becomes part of your AI-powered follow-up pipeline."
    >
      <div className="grid gap-3 sm:grid-cols-2 my-6">
        <ImportOptionCard
          icon={<Upload className="h-5 w-5 text-violet-500" />}
          title="Import from CSV"
          description="Export contacts from any CRM as a .csv file and upload here. AgentStack maps your columns automatically."
          href={saPath("/contacts?import=1")}
          cta="Upload CSV"
        />
        <ImportOptionCard
          icon={<Users className="h-5 w-5 text-blue-500" />}
          title="Add manually"
          description="Got just a handful of leads? Add them one by one from the Contacts page."
          href={saPath("/contacts")}
          cta="Go to Contacts"
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={onSkip}
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          Skip for now — I'll import later
        </button>
      </div>

      <TeachingNote>
        Already using GoHighLevel, Follow Up Boss, kvCORE, or another CRM? Export your contacts
        as a CSV from those platforms and upload here. The importer handles duplicate detection
        automatically — so it's safe to upload even if you have some contacts already.
      </TeachingNote>
    </StepShell>
  );
}

function ImportOptionCard({
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
   Step 3 — Choose Your Goals
   ════════════════════════════════════════════════════════════ */

function StepChooseGoals({
  selectedGoals,
  onToggle,
  onNext,
}: {
  selectedGoals: Set<string>;
  onToggle: (id: string) => void;
  onNext: () => void;
}) {
  return (
    <StepShell
      icon={<Target className="h-6 w-6 text-amber-500" />}
      eyebrow="Step 3 of 6 · 1 min"
      title="What kind of business do you run?"
      subtitle="Choose everything that applies. We'll use this to recommend the right funnels, automations, and AI scripts for your specific situation."
    >
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 my-6">
        {GOAL_OPTIONS.map(({ id, label, icon: Icon }) => {
          const active = selectedGoals.has(id);
          return (
            <button
              key={id}
              onClick={() => onToggle(id)}
              className={cn(
                "flex flex-col items-start gap-2 rounded-xl border p-4 text-left transition-all",
                active
                  ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-700"
                  : "border-border bg-card hover:border-muted-foreground/30",
              )}
            >
              <div
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-lg",
                  active
                    ? "bg-blue-100 text-blue-600 dark:bg-blue-900/40"
                    : "bg-muted text-muted-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
              </div>
              <span
                className={cn(
                  "text-sm font-medium leading-snug",
                  active ? "text-blue-700 dark:text-blue-300" : "",
                )}
              >
                {label}
              </span>
              {active && (
                <CheckCircle2 className="h-3.5 w-3.5 self-end text-blue-500" />
              )}
            </button>
          );
        })}
      </div>

      <Button onClick={onNext} disabled={selectedGoals.size === 0}>
        Continue
        <ArrowRight className="ml-1.5 h-4 w-4" />
      </Button>
      {selectedGoals.size === 0 && (
        <p className="mt-2 text-xs text-muted-foreground">Select at least one to continue.</p>
      )}

      <TeachingNote>
        Your selection helps AgentStack surface the right templates, funnel suggestions, and AI
        scripts. You can update these at any time in your account settings — your data is never
        locked to a category.
      </TeachingNote>
    </StepShell>
  );
}

/* ════════════════════════════════════════════════════════════
   Step 4 — Launch Marketing
   ════════════════════════════════════════════════════════════ */

function StepLaunchMarketing({
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
      icon={<Zap className="h-6 w-6 text-amber-500" />}
      eyebrow="Step 4 of 6 · 3 min"
      title="Launch your first lead capture funnel"
      subtitle="Pick a ready-made funnel. We'll set up the form and wire the AI Speed-to-Lead automation so every new inquiry gets a follow-up within 60 seconds — automatically."
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
          Build my funnel
          <ArrowRight className="ml-1.5 h-4 w-4" />
        </Button>
        <button
          onClick={onSkip}
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          Skip — I'll set this up later
        </button>
      </div>

      <TeachingNote>
        Every funnel is built on two things: a Form (the page where leads give you their info)
        and a Speed-to-Lead Automation (the AI that texts and emails them the second they submit).
        AgentStack pre-configures both — you just review and activate. The whole thing takes
        about 3 minutes.
      </TeachingNote>
    </StepShell>
  );
}

/* ════════════════════════════════════════════════════════════
   Step 5 — AI Setup
   ════════════════════════════════════════════════════════════ */

function StepAISetup({
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
      icon={<Bot className="h-6 w-6 text-indigo-600" />}
      eyebrow="Step 5 of 6 · 2 min"
      title="Activate your AI receptionist"
      subtitle="Your AI agent is already pre-configured with a real estate persona and has read your Business Profile. All you need to do is review the persona, enable it, and go live."
    >
      <div className="grid gap-3 sm:grid-cols-2 my-6">
        {[
          {
            title: "Web Chat Widget",
            description: "An AI chat bubble on your website that qualifies leads instantly, 24/7.",
            badge: "Quickest to activate",
            badgeColor: "emerald",
          },
          {
            title: "SMS Receptionist",
            description: "Connect your Twilio number and the AI handles inbound texts automatically.",
            badge: "Most leads use this",
            badgeColor: "blue",
          },
        ].map((card) => (
          <div key={card.title} className="rounded-xl border border-border bg-card p-4">
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
        <Button render={<Link href={saPath("/ai-agents")} />} onClick={onNext}>
          Review &amp; Activate AI Agent
          <ArrowRight className="ml-1.5 h-4 w-4" />
        </Button>
        <button
          onClick={onSkip}
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          Skip for now
        </button>
      </div>

      <TeachingNote>
        The AI reads your Business Profile so it already knows your name, brokerage, service
        areas, and brand voice. From AI Agents, click "Web Chat" and flip the toggle — your
        widget snippet is generated instantly. SMS requires connecting a Twilio number in Settings
        first, which takes about 5 minutes.
      </TeachingNote>
    </StepShell>
  );
}

/* ════════════════════════════════════════════════════════════
   Step 6 — Done
   ════════════════════════════════════════════════════════════ */

function StepDone({
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
      eyebrow="You're all set!"
      title="Your CRM is ready to use"
      subtitle="You've completed the setup. AgentStack is configured and your AI receptionist is standing by. Let's go close some deals."
    >
      {/* what was completed */}
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
            You can finish the remaining steps any time from your dashboard.
          </p>
        )}
      </div>

      {/* quick links */}
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
        Go to Dashboard
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
