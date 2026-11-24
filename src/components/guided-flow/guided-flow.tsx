"use client";

import { useMemo, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Check, PlayCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { AutoplayVideo } from "@/components/onboarding/autoplay-video";

export type GuidedAnswers = Record<string, string>;

export interface GuidedChoice {
  id: string;
  label: string;
  description?: string;
  icon?: React.ElementType;
}

export interface GuidedStepContext {
  answers: GuidedAnswers;
  setAnswer: (stepId: string, value: string) => void;
  next: () => void;
  close: () => void;
}

/**
 * One screen of a guided flow. A step with `choices` is a question: picking
 * one records the answer and advances. Any other step renders `body` and
 * advances with the Continue button, which `canContinue` can hold shut until
 * something real has happened (a verified connection, not a click).
 */
export interface GuidedStep {
  id: string;
  title: string;
  description?: string;
  choices?: GuidedChoice[];
  body?: (ctx: GuidedStepContext) => ReactNode;
  canContinue?: (ctx: GuidedStepContext) => boolean;
  continueLabel?: string;
  /** Final screen: no Continue, shows a Finish button that closes. */
  final?: boolean;
}

/**
 * Reusable "one decision per screen" pop-up. Steps are recomputed from the
 * answers on every render, so a branch the user backs out of disappears
 * instead of leaving stale screens in the sequence.
 */
export function GuidedFlow({
  open,
  onOpenChange,
  steps: resolveSteps,
  finishLabel = "Done",
  video,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  steps: (answers: GuidedAnswers) => GuidedStep[];
  finishLabel?: string;
  /** Short Zack walkthrough for this flow, offered collapsed above the steps. */
  video?: string;
}) {
  const [answers, setAnswers] = useState<GuidedAnswers>({});
  // Zack plays straight away on the first screen; the realtor can hide him.
  const [showVideo, setShowVideo] = useState(true);
  const [history, setHistory] = useState<string[]>([]);

  const steps = useMemo(() => resolveSteps(answers), [resolveSteps, answers]);
  const currentId = history[history.length - 1] ?? steps[0]?.id;
  const index = Math.max(0, steps.findIndex((s) => s.id === currentId));
  const step = steps[index];

  function reset() {
    setAnswers({});
    setHistory([]);
    setShowVideo(true);
  }

  function close() {
    onOpenChange(false);
    reset();
  }

  function goTo(stepsNow: GuidedStep[], fromId: string) {
    const i = stepsNow.findIndex((s) => s.id === fromId);
    const nextStep = stepsNow[i + 1];
    if (nextStep) setHistory((h) => [...(h.length ? h : [fromId]), nextStep.id]);
  }

  function setAnswer(stepId: string, value: string) {
    const nextAnswers = { ...answers, [stepId]: value };
    setAnswers(nextAnswers);
    goTo(resolveSteps(nextAnswers), stepId);
  }

  const ctx: GuidedStepContext = {
    answers,
    setAnswer,
    next: () => step && goTo(steps, step.id),
    close,
  };

  function back() {
    const prevHistory = history.slice(0, -1);
    const prevId = prevHistory[prevHistory.length - 1];
    if (prevId) {
      const { [prevId]: _dropped, ...rest } = answers;
      void _dropped;
      setAnswers(rest);
    }
    setHistory(prevHistory.length > 1 ? prevHistory : []);
  }

  if (!step) return null;

  const total = steps.length;
  const canContinue = step.canContinue ? step.canContinue(ctx) : true;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
        else onOpenChange(true);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <div className="flex items-center gap-1.5" aria-hidden>
          {steps.map((s, i) => (
            <span
              key={s.id}
              className={cn(
                "h-1 flex-1 rounded-full",
                i <= index ? "bg-primary" : "bg-muted",
              )}
            />
          ))}
        </div>
        <div className="flex items-center justify-between gap-2">
          <p className="text-muted-foreground text-xs">
            Step {index + 1} of {total}
          </p>
          {video ? (
            <button
              type="button"
              onClick={() => setShowVideo((v) => !v)}
              className="text-primary inline-flex items-center gap-1 text-xs font-medium hover:underline"
            >
              {showVideo ? <X className="h-3.5 w-3.5" /> : <PlayCircle className="h-3.5 w-3.5" />}
              {showVideo ? "Hide video" : "Watch Zack explain this"}
            </button>
          ) : null}
        </div>
        {video && showVideo && open ? <AutoplayVideo src={video} /> : null}

        <DialogTitle className="text-lg">{step.title}</DialogTitle>
        {step.description ? (
          <DialogDescription>{step.description}</DialogDescription>
        ) : null}

        {step.choices ? (
          <div className="mt-2 grid gap-2">
            {step.choices.map((choice) => {
              const Icon = choice.icon;
              const selected = answers[step.id] === choice.id;
              return (
                <button
                  key={choice.id}
                  type="button"
                  onClick={() => setAnswer(step.id, choice.id)}
                  className={cn(
                    "hover:border-primary hover:bg-primary/5 flex items-start gap-3 rounded-xl border p-3 text-left transition-colors",
                    selected && "border-primary bg-primary/5",
                  )}
                >
                  {Icon ? (
                    <span className="bg-primary/10 text-primary flex h-8 w-8 shrink-0 items-center justify-center rounded-lg">
                      <Icon className="h-4 w-4" />
                    </span>
                  ) : null}
                  <span>
                    <span className="block text-sm font-medium">{choice.label}</span>
                    {choice.description ? (
                      <span className="text-muted-foreground mt-0.5 block text-xs">
                        {choice.description}
                      </span>
                    ) : null}
                  </span>
                </button>
              );
            })}
          </div>
        ) : null}

        {step.body ? <div className="mt-2 text-sm">{step.body(ctx)}</div> : null}

        <div className="mt-4 flex items-center justify-between gap-2">
          {index > 0 && !step.final ? (
            <Button variant="ghost" size="sm" onClick={back}>
              <ArrowLeft className="mr-1 h-3.5 w-3.5" /> Back
            </Button>
          ) : (
            <span />
          )}
          {step.final ? (
            <Button size="sm" onClick={close}>
              <Check className="mr-1 h-3.5 w-3.5" /> {finishLabel}
            </Button>
          ) : !step.choices ? (
            <Button size="sm" onClick={ctx.next} disabled={!canContinue}>
              {step.continueLabel ?? "Continue"}
              <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </Button>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
