"use client";

import Link from "next/link";
import { ArrowRight, Check, Circle, CircleDashed, Loader2, Minus } from "lucide-react";
import type { SubAccountDoc } from "@/types/tenancy";
import { useMethodProgress } from "@/hooks/use-method-progress";
import { AGENTSTACK_METHOD_NAME } from "@/config/landing";
import type { MethodStepStatus, MethodTaskState } from "@/lib/onboarding/method";
import { cn } from "@/lib/utils";

const STATUS_LABEL: Record<MethodStepStatus, string> = {
  complete: "Complete",
  in_progress: "In progress",
  not_started: "Not started",
};

const STATUS_CLASS: Record<MethodStepStatus, string> = {
  complete: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  in_progress: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  not_started: "bg-muted text-muted-foreground",
};

function TaskIcon({ task }: { task: MethodTaskState }) {
  if (task.done) return <Check className="h-4 w-4 text-emerald-600" aria-label="Done" />;
  if (task.skipped) return <Minus className="text-muted-foreground h-4 w-4" aria-label="Skipped" />;
  return task.optional ? (
    <CircleDashed className="text-muted-foreground h-4 w-4" aria-label="Optional" />
  ) : (
    <Circle className="text-muted-foreground h-4 w-4" aria-label="To do" />
  );
}

/**
 * The setup hub: every step of The AgentStack Method with its status and,
 * under it, each setup task with a link to where it is done. It reads the
 * same progress model as the dashboard card, the setup pill and the sidebar
 * badge, so the "x of 6" here is the "x of 6" everywhere.
 */
export function SetupHub({
  subAccountId,
  subAccount,
  saPath,
}: {
  subAccountId: string;
  subAccount: SubAccountDoc | null;
  saPath: (path: string) => string;
}) {
  const { method } = useMethodProgress(subAccountId, subAccount);

  if (!method) {
    return (
      <div className="text-muted-foreground flex h-48 items-center justify-center text-sm" data-testid="setup-hub-loading">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Checking your setup…
      </div>
    );
  }

  const next = method.nextStep;

  return (
    <div className="space-y-6" data-testid="setup-hub">
      <section className="bg-card rounded-2xl border p-5">
        <p className="text-muted-foreground text-[11px] font-semibold tracking-[0.24em] uppercase">
          {AGENTSTACK_METHOD_NAME}
        </p>
        <h2 className="mt-1 text-lg font-semibold tracking-tight">
          {method.completedCount} of {method.total} steps complete · {method.percent}% ready
        </h2>
        <div className="bg-muted mt-3 h-2 rounded-full">
          <div className="h-2 rounded-full bg-blue-600" style={{ width: `${method.percent}%` }} />
        </div>
        {next?.nextTask ? (
          <Link
            href={saPath(next.nextTask.href)}
            className="text-primary mt-3 inline-flex items-center gap-1 text-sm font-medium hover:underline"
          >
            Next: {next.name} · {next.nextTask.label} <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        ) : (
          <p className="text-muted-foreground mt-3 text-sm">
            Every step is complete. You can still change anything below.
          </p>
        )}
      </section>

      <ol className="space-y-3">
        {method.steps.map((step, i) => (
          <li key={step.id} className="bg-card rounded-2xl border p-5" data-testid={`setup-hub-step-${step.id}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-muted-foreground text-xs font-semibold">Step {i + 1}</p>
                <h3 className="text-base font-semibold">{step.name}</h3>
                <p className="text-muted-foreground text-sm">{step.summary}</p>
              </div>
              <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", STATUS_CLASS[step.status])}>
                {STATUS_LABEL[step.status]}
              </span>
            </div>
            <ul className="mt-3 divide-y border-t">
              {step.tasks.map((task) => (
                <li key={task.id}>
                  <Link
                    href={saPath(task.href)}
                    className="hover:bg-muted/40 flex items-center gap-3 rounded-md px-1 py-2.5 text-sm"
                  >
                    <TaskIcon task={task} />
                    <span className={cn("flex-1", task.done && "text-muted-foreground")}>
                      {task.label}
                      {task.optional ? <span className="text-muted-foreground"> (optional)</span> : null}
                      {task.skipped ? <span className="text-muted-foreground"> (skipped)</span> : null}
                    </span>
                    <span className="text-primary inline-flex items-center gap-1 text-xs font-medium">
                      {task.done ? "Review" : "Open"} <ArrowRight className="h-3 w-3" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </div>
  );
}
