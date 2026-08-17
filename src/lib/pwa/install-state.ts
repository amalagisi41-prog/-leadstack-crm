/**
 * When to ask someone to install the app, and when to stop asking.
 *
 * Two things make this harder than it looks.
 *
 * First, there is no reliable cross-browser way to ask "is this already
 * installed?". `display-mode: standalone` only answers "am I running inside
 * the installed app right now" — it is false in the browser tab of someone
 * who installed it yesterday. Chromium fires `appinstalled` once, which we can
 * record, but iOS fires nothing at all, and an iOS home-screen app has
 * historically had its own storage separate from Safari's, so a flag written
 * inside the installed app may never be visible to the tab that prompted. That
 * is why an explicit "I've already added it" answer exists: on iOS it is the
 * only signal we will ever get.
 *
 * Second, "keep asking until they install" and "do not make the product
 * hostile" pull against each other. A modal on every sign-in with no way out
 * trains people to dismiss it unread, and the ones who cannot install today —
 * borrowed laptop, locked-down work phone — get punished for it. So dismissing
 * snoozes rather than silences, and the snooze lengthens each time. The prompt
 * keeps coming back, at a decreasing rate, and the sidebar entry and the
 * download page stay available the whole time for anyone who wants it sooner.
 */

export type InstallPlatform = "chromium" | "ios" | "safari-desktop" | "other";

/** Snooze lengths in days, indexed by how many times they have dismissed. */
export const SNOOZE_LADDER_DAYS = [3, 7, 30];

const DAY_MS = 86_400_000;

/**
 * Which install route this device has.
 *
 * iOS is decided by device, not by browser: every browser on iOS is WebKit and
 * installs through the same Share sheet, so Chrome on an iPhone needs the iOS
 * instructions, not the Chromium ones. iPadOS reports itself as MacIntel and
 * is only distinguishable by having a touch screen.
 */
export function detectPlatform(input: {
  userAgent: string;
  platform: string;
  maxTouchPoints: number;
}): InstallPlatform {
  const { userAgent: ua, platform, maxTouchPoints } = input;
  const isIos =
    /iPhone|iPad|iPod/.test(ua) ||
    (platform === "MacIntel" && maxTouchPoints > 1);
  if (isIos) return "ios";
  const isSafari = /Safari/.test(ua) && !/Chrome|CriOS|Edg|OPR|Chromium/.test(ua);
  if (isSafari) return "safari-desktop";
  return "other";
}

/** True when this platform can never show a one-tap install button. */
export function requiresManualInstall(platform: InstallPlatform): boolean {
  return platform === "ios" || platform === "safari-desktop";
}

/** When the next prompt is allowed, given how many times they've dismissed. */
export function nextSnoozeUntil(dismissCount: number, now: Date): string {
  const index = Math.min(
    Math.max(dismissCount, 0),
    SNOOZE_LADDER_DAYS.length - 1
  );
  return new Date(now.getTime() + SNOOZE_LADDER_DAYS[index] * DAY_MS).toISOString();
}

export interface PromptDecision {
  /** Show the modal now. */
  prompt: boolean;
  /** Show the persistent sidebar entry and keep the download page relevant. */
  showCallout: boolean;
}

/**
 * Whether to interrupt this sign-in.
 *
 * `shownThisSession` keeps the modal to once per browser session rather than
 * once per page — moving between screens is not a new sign-in.
 */
export function decidePrompt(input: {
  installed: boolean;
  snoozedUntil: string | null;
  shownThisSession: boolean;
  runningStandalone: boolean;
  now: Date;
}): PromptDecision {
  const { installed, snoozedUntil, shownThisSession, runningStandalone, now } =
    input;

  // Already inside the installed app: nothing to advertise, and the callout
  // would be pointing at something they are currently using.
  if (runningStandalone || installed) {
    return { prompt: false, showCallout: false };
  }
  if (shownThisSession) return { prompt: false, showCallout: true };

  const until = snoozedUntil ? Date.parse(snoozedUntil) : NaN;
  // A malformed or absent value means "never snoozed", not "snoozed forever" —
  // failing the other way would silently retire the prompt for that user.
  const snoozed = Number.isFinite(until) && until > now.getTime();

  return { prompt: !snoozed, showCallout: true };
}
