import { ArrowDown, ArrowRight, type LucideIcon } from "lucide-react";

export interface WorkflowStep {
  icon: LucideIcon;
  label: string;
  /** Optional 1-line subtitle shown under the label. */
  detail?: string;
  /** Tailwind colour token suffix (e.g. "indigo", "violet"). Drives the icon tint. */
  tone?: WorkflowTone;
}

export type WorkflowTone =
  | "indigo"
  | "violet"
  | "pink"
  | "emerald"
  | "amber"
  | "rose"
  | "sky"
  | "slate";

interface WorkflowDiagramProps {
  steps: WorkflowStep[];
}

/**
 * Lightweight HTML/CSS workflow diagram. Renders steps as bordered cards
 * connected by chevrons — flex-row at md+ with right arrows, flex-col on
 * mobile with down arrows. No SVG, no extra deps.
 */
export function WorkflowDiagram({ steps }: WorkflowDiagramProps) {
  return (
    <div className="-mx-1 overflow-x-auto px-1">
      <div className="flex flex-col items-stretch gap-2 md:flex-row md:items-stretch md:gap-1">
        {steps.map((step, i) => (
          <div
            key={`${step.label}-${i}`}
            className="flex flex-col items-center gap-2 md:flex-row md:gap-1"
          >
            <StepCard step={step} />
            {i < steps.length - 1 && (
              <>
                <ArrowDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground md:hidden" />
                <ArrowRight className="hidden h-3.5 w-3.5 shrink-0 text-muted-foreground md:block" />
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function StepCard({ step }: { step: WorkflowStep }) {
  const Icon = step.icon;
  const tone = TONE_CLASSES[step.tone ?? "slate"];
  return (
    <div className="flex w-[8.5rem] shrink-0 flex-col items-center gap-1.5 rounded-xl border bg-background px-2 py-3 text-center md:w-[7.25rem]">
      <span
        className={`flex h-8 w-8 items-center justify-center rounded-lg ${tone.bg} ${tone.text}`}
      >
        <Icon className="h-4 w-4" />
      </span>
      <p className="text-[11px] font-medium leading-tight">{step.label}</p>
      {step.detail && (
        <p className="text-[10px] leading-tight text-muted-foreground">
          {step.detail}
        </p>
      )}
    </div>
  );
}

// Static class map so Tailwind's JIT keeps these utilities. Don't switch to
// dynamic concatenation.
const TONE_CLASSES: Record<WorkflowTone, { bg: string; text: string }> = {
  indigo: {
    bg: "bg-indigo-500/10",
    text: "text-indigo-600 dark:text-indigo-400",
  },
  violet: {
    bg: "bg-violet-500/10",
    text: "text-violet-600 dark:text-violet-400",
  },
  pink: {
    bg: "bg-pink-500/10",
    text: "text-pink-600 dark:text-pink-400",
  },
  emerald: {
    bg: "bg-emerald-500/10",
    text: "text-emerald-600 dark:text-emerald-400",
  },
  amber: {
    bg: "bg-amber-500/10",
    text: "text-amber-600 dark:text-amber-400",
  },
  rose: {
    bg: "bg-rose-500/10",
    text: "text-rose-600 dark:text-rose-400",
  },
  sky: {
    bg: "bg-sky-500/10",
    text: "text-sky-600 dark:text-sky-400",
  },
  slate: {
    bg: "bg-slate-500/10",
    text: "text-slate-600 dark:text-slate-400",
  },
};
