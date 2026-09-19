import { SUB_ACCOUNT_ROUTES } from "@/lib/navigation/sub-account-routes";
import { metaCanInbox } from "@/lib/comms/meta-capabilities";
import { deferralFor } from "./deferral";
import type { SubAccountDoc } from "@/types/tenancy";

/**
 * What first-run setup offers to connect, split by how much work it actually
 * is — and showing what is already done.
 *
 * The screen this replaces listed three identical cards with no status,
 * offered "Connect Gmail or Outlook" (Outlook is not supported), pointed at a
 * Google Business Profile page that is a coming-soon placeholder, presented
 * texting as an ordinary step when it needs carrier registration that takes
 * weeks, and omitted Facebook/Instagram entirely — the one connection here
 * that really is a single click.
 *
 * Two rules hold this file together:
 *
 *   1. **Never offer what does not exist.** Every entry below is a path that
 *      genuinely connects something today. The same honesty `deferral.ts`
 *      applies to LinkedIn ("AgentStack cannot post to LinkedIn yet"), which
 *      is why there is no Google Business Profile entry: its channel is a
 *      hidden coming-soon placeholder and its API needs a separate manual
 *      approval from Google.
 *
 *   2. **Say what it costs to leave it.** An agent deciding whether to bother
 *      needs the business outcome, not the feature name — "leads texting your
 *      listing sign reach you here" rather than "A2P 10DLC registration".
 *      Deferral costs come from `deferral.ts` so the wording stays in one
 *      place.
 *
 * Nothing here is blocking. `business_profile` is the only genuinely blocking
 * onboarding step and it is a different screen.
 */

export type ConnectTier = "one_click" | "needs_setup";

export interface ConnectItem {
  id: string;
  /** The noun the agent knows it by. */
  label: string;
  tier: ConnectTier;
  connected: boolean;
  /** The business outcome, in their words. Answers "why would I add this?". */
  why: string;
  /** What they give up by leaving it for later. */
  costIfSkipped: string;
  /**
   * Honest note about effort or elapsed time, where it is not immediate.
   * Texting is the one that matters: registration is out of the agent's
   * hands and takes weeks, so it must never look like a two-minute task
   * sitting between them and a finished setup.
   */
  timingNote?: string;
  /** Sub-account-relative path; the caller runs it through saPath(). */
  href: string;
  cta: string;
}

function isTextingConnected(sub: SubAccountDoc | null): boolean {
  return sub?.twilioConfig?.enabled === true;
}

function isBusinessEmailConnected(sub: SubAccountDoc | null): boolean {
  // Either the sub-account's own Google mailbox, or a verified sending
  // domain — both mean mail leaves as them rather than a shared address.
  // "verified" only — a Resend domain sitting at "pending" cannot send yet,
  // so counting it as connected would show a green tick for mail that still
  // goes out from the shared address.
  return (
    sub?.googleWorkspaceConfig?.status === "connected" ||
    sub?.resendConfig?.status === "verified"
  );
}

function isDomainConnected(sub: SubAccountDoc | null): boolean {
  // "live" only. `unknown` exists precisely because a DNS match alone is not
  // proof the domain is served, and treating it as connected here would be
  // the false green light the domain verifier was fixed to stop reporting.
  return !!sub?.customDomain && sub?.customDomainState === "live";
}

function isMlsConnected(sub: SubAccountDoc | null): boolean {
  return sub?.idxConfig?.connected === true || sub?.idxConfig?.enabled === true;
}

export function connectItemsFor(sub: SubAccountDoc | null): ConnectItem[] {
  return [
    {
      id: "social",
      label: "Facebook & Instagram",
      tier: "one_click",
      connected: metaCanInbox(sub?.metaConfig ?? null),
      why: "Your posts go out to your page, and messages from Facebook and Instagram land in your inbox here instead of on your phone.",
      costIfSkipped:
        "Posts won't publish to Facebook or Instagram, and DMs stay where they are.",
      href: SUB_ACCOUNT_ROUTES.settings,
      cta: "Sign in with Facebook",
    },
    {
      id: "business_email",
      label: "Your business email",
      tier: "one_click",
      connected: isBusinessEmailConnected(sub),
      why: "Emails go out from your own address, so they look like you sent them and land in inboxes instead of spam.",
      costIfSkipped:
        "Emails send from a shared address, which lands in spam more often.",
      href: SUB_ACCOUNT_ROUTES.messagingSettings,
      cta: "Sign in with Google",
    },
    {
      id: "calendar",
      label: "Google or Outlook Calendar",
      tier: "one_click",
      connected: sub?.calendarConfig?.status === "connected",
      why: "New bookings can be coordinated with the calendar you already use, so your public availability and appointment workflow stay in one place.",
      costIfSkipped:
        "AgentStack bookings still work, but your external calendar will not be connected until you authorize it.",
      timingNote: "A secure provider sign-in opens in a new step; no calendar URL or password is pasted into AgentStack.",
      href: SUB_ACCOUNT_ROUTES.settings,
      cta: sub?.calendarConfig?.status === "connected" ? "Manage calendar" : "Connect calendar",
    },
    {
      id: "domain",
      label: "Your website address",
      tier: "needs_setup",
      connected: isDomainConnected(sub),
      why: "Your site lives at your own name rather than a temporary address.",
      costIfSkipped: deferralFor("domain").cost,
      timingNote:
        "Involves a change at whoever you bought the domain from, and can take a few hours to take effect.",
      href: SUB_ACCOUNT_ROUTES.domain,
      cta: "Connect my domain",
    },
    {
      id: "mls",
      label: "Your listing sources",
      tier: "needs_setup",
      connected: isMlsConnected(sub),
      why: "Bring MLS/IDX listings or agent-managed properties into one inventory so campaigns and public pages use the same listing record.",
      costIfSkipped: deferralFor("lseo").cost,
      timingNote:
        "Needs a key from IDX Broker, which your MLS has to approve first.",
      href: SUB_ACCOUNT_ROUTES.listings,
      cta: "Manage listings",
    },
    {
      id: "texting",
      label: "Texting from a business number",
      tier: "needs_setup",
      connected: isTextingConnected(sub),
      why: "Leads who text your sign reach you in here, and follow-ups can go out by text.",
      costIfSkipped: deferralFor("sms").cost,
      // Straight from deferral.ts: weeks, and out of their hands. Keep your
      // mobile in the meantime — that is the honest Stage 1 answer.
      timingNote: deferralFor("sms").returnWhen,
      href: SUB_ACCOUNT_ROUTES.messagingSettings,
      cta: "Start texting setup",
    },
  ];
}

export function oneClickItems(items: ConnectItem[]): ConnectItem[] {
  return items.filter((i) => i.tier === "one_click");
}

export function needsSetupItems(items: ConnectItem[]): ConnectItem[] {
  return items.filter((i) => i.tier === "needs_setup");
}

/** How many are already done — drives the screen's "2 of 5 connected" line. */
export function connectedCount(items: ConnectItem[]): number {
  return items.filter((i) => i.connected).length;
}
