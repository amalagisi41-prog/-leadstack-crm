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
  PlayCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAgency } from "@/hooks/use-agency";
import { OnboardingHelp } from "@/components/dashboard/onboarding-help";
import {
  ONBOARDING_STEPS,
  type OnboardingStepId,
  type OnboardingStepMeta,
  type OnboardingVideos,
} from "@/lib/onboarding/steps";

// Icon per step id lives here (client-only) so the shared step metadata in
// lib/onboarding/steps.ts stays plain data, importable by server code.
const STEP_ICONS: Record<OnboardingStepId, React.ElementType> = {
  contacts: Users,
  sms: Phone,
  form: FileText,
  automation: Zap,
  pipeline: KanbanSquare,
  ai: Bot,
};

function StepRow({
  step,
  videoUrl,
  done,
  saPath,
  preview,
  onToggle,
}: {
  step: OnboardingStepMeta;
  videoUrl: string | null;
  done: boolean;
  saPath?: (p: string) => string;
  /** Preview mode (agency settings): CTA is inert since there's no sub-account. */
  preview?: boolean;
  onToggle: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const Icon = STEP_ICONS[step.id];

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

        {/* Video badge — only when a walkthrough URL is configured */}
        {videoUrl && !done && (
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
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {preview || !saPath ? (
              <Button size="sm" disabled>
                {step.cta}
              </Button>
            ) : (
              <Button size="sm" render={<Link href={saPath(step.href)} />}>
                {step.cta}
              </Button>
            )}
            {videoUrl && (
              <Button
                size="sm"
                variant="outline"
                render={<a href={videoUrl} target="_blank" rel="noreferrer" />}
              >
                <PlayCircle className="mr-1 h-3.5 w-3.5" />
                Watch ({step.videoMinutes} min)
              </Button>
            )}
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
  preview = false,
  videosOverride,
}: {
  saPath?: (path: string) => string;
  /**
   * Preview mode for the agency settings page — CTAs are inert, the Dismiss
   * control is hidden, and video URLs come from `videosOverride` (the
   * in-progress form) instead of the saved agency doc.
   */
  preview?: boolean;
  videosOverride?: OnboardingVideos;
}) {
  const agency = useAgency();
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  const videos = preview ? (videosOverride ?? {}) : agency.onboardingVideos;

  const toggle = (id: string) =>
    setCompleted((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const doneCount = completed.size;
  const totalCount = ONBOARDING_STEPS.length;
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
        {!preview && (
          <button
            onClick={() => setDismissed(true)}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Dismiss
          </button>
        )}
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
        {ONBOARDING_STEPS.map((step) => (
          <StepRow
            key={step.id}
            step={step}
            videoUrl={videos[step.id] ?? null}
            done={completed.has(step.id)}
            saPath={saPath}
            preview={preview}
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

      {/* AI setup assistant — backs up the videos with instant Q&A. Hidden in
          the agency-settings preview (it makes live LLM calls). */}
      {!preview && <OnboardingHelp />}
    </div>
  );
}
