"use client";

import Link from "next/link";
import {
  ActivitySquare,
  ArrowRight,
  Bot,
  Building2,
  FileText,
  Globe,
  UserPlus,
  Users,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface NextStep {
  number: number;
  title: string;
  why: string;
  cta: string;
  href: string;
  icon: LucideIcon;
  /** Whether the href is sub-account-scoped (needs templating). */
  requiresSubAccount?: boolean;
  tone: "indigo" | "violet" | "pink" | "emerald" | "amber" | "sky";
}

const STEPS: NextStep[] = [
  {
    number: 1,
    title: "Verify your integrations are working",
    why: "Open the Status tab on Agency home for a traffic-light health check across all your integrations — Firebase, Stripe, Resend, Twilio, the AI Agents stack (OpenRouter / Firecrawl / Vapi), Meta Inbox, QStash, gitpage, and Mapbox. Anything red or amber needs attention before the dependent features work.",
    cta: "Open Status",
    href: "/agency",
    icon: ActivitySquare,
    tone: "emerald",
  },
  {
    number: 2,
    title: "Create your first client sub-account",
    why: "Each client gets their own isolated workspace. Contacts, deals, forms, automations, and the website builder all live inside a sub-account.",
    cta: "New sub-account",
    href: "/agency/sub-accounts/new",
    icon: Building2,
    tone: "indigo",
  },
  {
    number: 3,
    title: "Add your first contacts",
    why: "Add one manually to learn the profile + activity timeline, or import a CSV to bulk-load existing leads. Field mapping is fuzzy — name/email/phone/company columns auto-detect.",
    cta: "Open Contacts",
    href: "/contacts",
    icon: Users,
    requiresSubAccount: true,
    tone: "violet",
  },
  {
    number: 4,
    title: "Build your first form",
    why: "Pick fields with the drag-order builder, set the public hosted page or grab the iframe embed snippet. Submissions auto-create contacts and (optionally) deals.",
    cta: "Open Forms",
    href: "/forms",
    icon: FileText,
    requiresSubAccount: true,
    tone: "sky",
  },
  {
    number: 5,
    title: "Attach an automation to that form",
    why: "Wire the Speed-to-Lead recipe so every submission gets an SMS + email reply within seconds, plus an owner notification. Compliance (unsubscribe + STOP/START) is built in.",
    cta: "Open Automations",
    href: "/automations",
    icon: Zap,
    requiresSubAccount: true,
    tone: "pink",
  },
  {
    number: 6,
    title: "Spin up a client website",
    why: "Use the Website tab to push a marketing site to gitpage.site. Click Sample to prefill a demo build, or fill in the client's details. Live URL in 1–3 minutes.",
    cta: "Open Website",
    href: "/website",
    icon: Globe,
    requiresSubAccount: true,
    tone: "amber",
  },
  {
    number: 7,
    title: "Configure the AI Agent",
    why: "Open AI Agents → Overview to set the persona, business hours, and escalation email. Paste the client's website URL and click 'Refresh KB' so the bot can answer factual questions. Then turn on the channels you want: Web Chat (paste the embed snippet onto the client's site), SMS + WhatsApp (auto-replies on inbound messages), Voice (Vapi answers inbound calls), and Outbound Voice (the AI dials contacts proactively). Every channel shares the same persona.",
    cta: "Open AI Agents",
    href: "/ai-agents",
    icon: Bot,
    requiresSubAccount: true,
    tone: "violet",
  },
  {
    number: 8,
    title: "Invite a teammate",
    why: "Add an admin or collaborator to a sub-account. Members are scoped to that one workspace — no leak across clients.",
    cta: "Open Settings",
    href: "/dashboard/settings",
    icon: UserPlus,
    requiresSubAccount: true,
    tone: "violet",
  },
];

interface NextStepsTabProps {
  firstSubAccountId: string | null;
}

export function NextStepsTab({ firstSubAccountId }: NextStepsTabProps) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        A recommended order for the first hour. Each step takes a couple of
        minutes — feel free to skip around.
      </p>

      <ol className="space-y-3">
        {STEPS.map((step) => (
          <StepCard
            key={step.number}
            step={step}
            firstSubAccountId={firstSubAccountId}
          />
        ))}
      </ol>
    </div>
  );
}

function StepCard({
  step,
  firstSubAccountId,
}: {
  step: NextStep;
  firstSubAccountId: string | null;
}) {
  const tone = TONE_CLASSES[step.tone];
  const href = step.requiresSubAccount
    ? firstSubAccountId
      ? `/sa/${firstSubAccountId}${step.href}`
      : null
    : step.href;

  return (
    <li className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-center">
      <div className="flex flex-1 items-start gap-3">
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${tone.bg} ${tone.text}`}
        >
          <span className="text-sm font-semibold">{step.number}</span>
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{step.title}</p>
          <p className="mt-1 text-xs text-muted-foreground">{step.why}</p>
        </div>
      </div>
      <div className="flex shrink-0 justify-end sm:justify-start">
        {href ? (
          <Button size="sm" render={<Link href={href} />}>
            <step.icon className="mr-1 h-3.5 w-3.5" />
            {step.cta}
            <ArrowRight className="ml-1 h-3 w-3" />
          </Button>
        ) : (
          <Button size="sm" disabled>
            Needs a sub-account
          </Button>
        )}
      </div>
    </li>
  );
}

const TONE_CLASSES: Record<NextStep["tone"], { bg: string; text: string }> = {
  indigo: {
    bg: "bg-indigo-500/10",
    text: "text-indigo-600 dark:text-indigo-400",
  },
  violet: {
    bg: "bg-violet-500/10",
    text: "text-violet-600 dark:text-violet-400",
  },
  pink: { bg: "bg-pink-500/10", text: "text-pink-600 dark:text-pink-400" },
  emerald: {
    bg: "bg-emerald-500/10",
    text: "text-emerald-600 dark:text-emerald-400",
  },
  amber: {
    bg: "bg-amber-500/10",
    text: "text-amber-600 dark:text-amber-400",
  },
  sky: { bg: "bg-sky-500/10", text: "text-sky-600 dark:text-sky-400" },
};
