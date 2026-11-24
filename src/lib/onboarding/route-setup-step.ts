import type { SetupProgress, SetupStepId } from "./setup-progress";

/**
 * Which setup step a workspace page depends on. Matched by the path segment
 * after `/sa/{id}`, most specific first. "next" means the page isn't tied
 * to one step (the dashboard), so it asks whatever comes next overall.
 */
const ROUTE_STEPS: ReadonlyArray<[prefix: string, step: SetupStepId | "next"]> = [
  ["/dashboard/settings", "communications"],
  ["/dashboard", "next"],
  ["/conversations", "communications"],
  ["/contacts", "communications"],
  ["/broadcasts", "communications"],
  ["/ai-agents", "communications"],
  ["/calendar", "communications"],
  ["/booking", "communications"],
  ["/idx", "listings"],
  ["/properties", "listings"],
  ["/marketing", "listings"],
  ["/social", "social"],
  ["/domain", "domain"],
  ["/website-studio", "domain"],
  ["/site-health", "domain"],
];

export function setupStepForPath(pathname: string): SetupStepId | "next" | null {
  const rest = /^\/sa\/[^/]+(\/.*)?$/.exec(pathname)?.[1] ?? "";
  for (const [prefix, step] of ROUTE_STEPS) {
    if (rest === prefix || rest.startsWith(`${prefix}/`)) return step;
  }
  return null;
}

/**
 * The pop-up a page should open on its own, or null. A page whose step is
 * done asks nothing. A page whose step is still locked asks the step that
 * unlocks it, since that's the question standing between the realtor and
 * the page they opened.
 */
export function setupStepToPrompt(pathname: string, progress: SetupProgress): SetupStepId | null {
  if (progress.complete) return null;
  const step = setupStepForPath(pathname);
  if (!step) return null;
  if (step === "next") return progress.nextStep;
  const state = progress.states[step];
  if (state === "done") return null;
  if (state === "locked") return progress.nextStep;
  return step;
}
