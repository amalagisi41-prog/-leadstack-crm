"use client";

import { useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  Circle,
  ChevronDown,
  ChevronUp,
  Users,
  Phone,
  Bot,
  Zap,
  KanbanSquare,
  FileText,
  Rocket,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ChecklistStep {
  id: string;
  icon: React.ElementType;
  title: string;
  description: string;
  cta: string;
  href: string;
  videoMinutes?: number;
}

const STEPS: ChecklistStep[] = [
  {
    id: "contacts",
    icon: Users,
    title: "Import your contacts",
    description:
      "Upload a CSV from your old CRM or add your first contacts manually. Your entire database lives here.",
    cta: "Go to Contacts",
    href: "/contacts?import=1",
    videoMinutes: 4,
  },
  {
    id: "sms",
    icon: Phone,
    title: "Connect your phone number",
    description:
      "Link your dedicated Twilio number so you can send and receive SMS directly in the CRM — and the AI can reply on your behalf.",
    cta: "Open SMS Settings",
    href: "/dashboard/settings?tab=sms",
    videoMinutes: 3,
  },
  {
    id: "form",
    icon: FileText,
    title: "Build your lead capture form",
    description:
      "Create a form for your website or a landing page. Every submission auto-creates a contact and drops them into your pipeline.",
    cta: "Build a Form",
    href: "/forms",
    videoMinutes: 5,
  },
  {
    id: "automation",
    icon: Zap,
    title: "Turn on Speed-to-Lead",
    description:
      "Attach the Speed-to-Lead automation to your form so every new inquiry gets an SMS and email within 60 seconds — automatically.",
    cta: "Set Up Automation",
    href: "/automations",
    videoMinutes: 4,
  },
  {
    id: "pipeline",
    icon: KanbanSquare,
    title: "Review your pipeline",
    description:
      "Your pipeline is pre-set for real estate: New Lead → Contacted → Showing Scheduled → Offer Made → Closed. Drag deals as they progress.",
    cta: "View Pipeline",
    href: "/pipeline",
    videoMinutes: 3,
  },
  {
    id: "ai",
    icon: Bot,
    title: "Activate your AI agent",
    description:
      "Your AI agent persona is pre-written for a CT realtor. Review it, add your business name, then enable it on SMS and Web Chat.",
    cta: "Set Up AI Agent",
    href: "/ai-agents",
    videoMinutes: 5,
  },
];

function StepRow({
  step,
  done,
  saPath,
  onToggle,
}: {
  step: ChecklistStep;
  done: boolean;
  saPath: (p: string) => string;
  onToggle: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const Icon = step.icon;

  return (
    <div
      className={cn(
        "rounded-xl border transition-colors",
        done
          ? "border-emerald-200 bg-emerald-50/50 dark:border-emerald-800/40 dark:bg-emerald-950/20"
          : "border-border bg-card",
      )}
    >
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        {/* Complete toggle */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
          className="shrink-0"
          aria-label={done ? "Mark incomplete" : "Mark complete"}
        >
          {done ? (
            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
          ) : (
            <Circle className="h-5 w-5 text-muted-foreground/40" />
          )}
        </button>

        {/* Icon */}
        <span
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
            done
              ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40"
              : "bg-blue-50 text-blue-600 dark:bg-blue-950/40",
          )}
        >
          <Icon className="h-4 w-4" />
        </span>

        {/* Title */}
        <span
          className={cn(
            "flex-1 text-sm font-medium",
            done && "text-muted-foreground line-through",
          )}
        >
          {step.title}
        </span>

        {/* Video badge */}
        {step.videoMinutes && !done && (
          <span className="hidden items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground sm:flex">
            {step.videoMinutes} min video
          </span>
        )}

        {expanded ? (
          <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
      </button>

      {expanded && !done && (
        <div className="border-t border-border px-4 py-3">
          <p className="text-sm text-muted-foreground">{step.description}</p>
          <div className="mt-3 flex items-center gap-2">
            <Button size="sm" render={<Link href={saPath(step.href)} />}>
              {step.cta}
            </Button>
            <Button size="sm" variant="ghost" onClick={onToggle}>
              Mark done
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function OnboardingChecklist({
  saPath,
}: {
  saPath: (path: string) => string;
}) {
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  const toggle = (id: string) =>
    setCompleted((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const doneCount = completed.size;
  const totalCount = STEPS.length;
  const allDone = doneCount === totalCount;
  const progressPct = Math.round((doneCount / totalCount) * 100);

  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white">
            <Rocket className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-semibold tracking-tight">
              {allDone ? "You're all set!" : "Get set up in 6 steps"}
            </h2>
            <p className="text-xs text-muted-foreground">
              {allDone
                ? "Your account is fully configured — time to close some deals."
                : `${doneCount} of ${totalCount} complete · about 22 min total`}
            </p>
          </div>
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Dismiss
        </button>
      </div>

      {/* Progress bar */}
      <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-500"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {/* Snapshot applied banner */}
      <div className="mt-3 flex items-center gap-2 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
        <Sparkles className="h-3.5 w-3.5 shrink-0" />
        Your account came pre-configured with real estate pipeline stages, 6
        email &amp; SMS templates, and a CT realtor AI persona. Just review and
        activate.
      </div>

      {/* Steps */}
      <div className="mt-4 space-y-2">
        {STEPS.map((step) => (
          <StepRow
            key={step.id}
            step={step}
            done={completed.has(step.id)}
            saPath={saPath}
            onToggle={() => toggle(step.id)}
          />
        ))}
      </div>

      {allDone && (
        <div className="mt-4 rounded-xl bg-emerald-50 p-4 text-center dark:bg-emerald-950/30">
          <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
            🎉 Setup complete — you&apos;re ready to work leads.
          </p>
        </div>
      )}
    </div>
  );
}
