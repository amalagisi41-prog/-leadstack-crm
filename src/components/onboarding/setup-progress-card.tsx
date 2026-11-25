"use client";

import Link from "next/link";
import { ArrowRight, ListChecks } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AGENTSTACK_METHOD_NAME } from "@/config/landing";
import { nextActionLabel, type MethodProgress } from "@/lib/onboarding/method";
import { setupHubHref } from "@/lib/onboarding/setup-hub-href";
import { cn } from "@/lib/utils";

/**
 * The dashboard's setup card: The AgentStack Method progress ("x of 6",
 * percent ready, the six steps), the next task, and "See all setup steps",
 * which opens the setup hub in one click.
 */
export function SetupProgressCard({
  progress,
  subAccountId,
  saPath,
}: {
  progress: MethodProgress;
  subAccountId: string;
  saPath: (path: string) => string;
}) {
  const nextStep = progress.nextStep;
  const nextTask = nextStep?.nextTask ?? null;
  if (!nextStep) return null;

  return (
    <section className="bg-card rounded-2xl border p-5" data-testid="setup-progress-card">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-2xl space-y-3">
          <div>
            <p className="text-muted-foreground text-[11px] font-semibold tracking-[0.24em] uppercase">
              {AGENTSTACK_METHOD_NAME}
            </p>
            <h2 className="mt-1 text-lg font-semibold tracking-tight">
              Your business is {progress.percent}% ready
            </h2>
          </div>
          <div>
            <p className="text-sm font-medium">Next: {nextActionLabel(progress)}</p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              {nextStep.name} — {nextStep.summary.toLowerCase()}.
            </p>
          </div>
          <ol className="text-muted-foreground flex flex-wrap gap-2 text-xs">
            {progress.steps.map((step) => (
              <li
                key={step.id}
                className={cn(
                  "rounded-full border px-3 py-1 font-medium",
                  step.status === "complete" && "border-emerald-500/40 text-emerald-700 dark:text-emerald-400",
                  step.id === nextStep.id && "border-primary text-foreground",
                )}
              >
                {step.name}
              </li>
            ))}
          </ol>
        </div>

        <div className="bg-muted/10 w-full max-w-xs rounded-xl border p-4">
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="text-foreground font-medium">Setup progress</span>
            <span className="text-muted-foreground">
              {progress.completedCount} of {progress.total} · {progress.percent}%
            </span>
          </div>
          <div className="bg-muted h-2 rounded-full">
            <div className="h-2 rounded-full bg-blue-600" style={{ width: `${progress.percent}%` }} />
          </div>
          {nextTask ? (
            <Button className="mt-4 w-full" render={<Link href={saPath(nextTask.href)} />}>
              {nextTask.label}
              <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
            </Button>
          ) : null}
          <Button
            variant="outline"
            className="mt-2 w-full"
            render={<Link href={setupHubHref(subAccountId)} data-testid="see-all-setup-steps" />}
          >
            <ListChecks className="mr-1.5 h-3.5 w-3.5" />
            See all setup steps
          </Button>
        </div>
      </div>
    </section>
  );
}
