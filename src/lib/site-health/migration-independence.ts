import type { SiteHealthTask } from "./tasks";

/**
 * "Can I cancel my old account yet?"
 *
 * Site Health used to answer a different question — whether AgentStack was
 * set up — and reaching 100% said nothing about whether the agent still
 * depended on GoHighLevel. Cancelling on the strength of that number could
 * take down a live website or release a business phone number.
 *
 * These tasks close that gap. Two rules shape the whole module:
 *
 *  1. Anything that CAN be verified is verified, not asked about. An agent
 *     under pressure ticks boxes.
 *  2. Anything that CANNOT be verified is recorded as an explicit, dated
 *     human attestation and labelled as one. There is no third category
 *     where the app quietly assumes the best.
 */

/**
 * Platforms an agent would actually cancel after migrating.
 *
 * `sourcePlatform` carries two different meanings depending on which control
 * wrote it: the CRM someone migrated away from, or — when they pick "Keep my
 * current host" — the web host they are staying on. Only the first is
 * something to wind down.
 *
 * Without this distinction, choosing "Keep my current host → WordPress"
 * produced a seven-item checklist telling the agent to port their phone
 * number off WordPress and export a backup before cancelling it, and dropped
 * the score from a denominator of 8 to 15. A workspace that never migrated
 * from anything was being told not to cancel a subscription it never had.
 */
const PRIOR_CRM_PLATFORMS = new Set([
  "gohighlevel",
  "followupboss",
  "kvcore",
  "lofty",
  "chime",
]);

/** True when this platform is a CRM the agent would wind down, not a host. */
export function isPriorCrmPlatform(
  platform: string | null | undefined
): boolean {
  return Boolean(platform && PRIOR_CRM_PLATFORMS.has(platform));
}

/** Things no code here can observe, so the agent confirms them by hand. */
export type MigrationAckId =
  | "conversations_saved"
  | "calendars_rebuilt"
  | "backup_exported"
  | "website_independent";

export const MIGRATION_ACK_IDS: readonly MigrationAckId[] = [
  "conversations_saved",
  "calendars_rebuilt",
  "backup_exported",
  "website_independent",
];

export interface MigrationAck {
  acknowledgedByUid: string;
  acknowledgedAt: string;
}

export type MigrationAcks = Partial<Record<MigrationAckId, MigrationAck>>;

export interface MigrationIndependenceInputs {
  /** Platform the account came from, e.g. "gohighlevel". Null for a fresh start. */
  migratedFrom: string | null;
  /** Display name for that platform. */
  migratedFromLabel: string | null;
  /** Site verified live at the agent's own domain. */
  siteVerifiedLive: boolean;
  /**
   * Site positively shown to be served by something other than the previous
   * platform. False when detection was inconclusive — see platform-detection.
   */
  siteConfirmedOffPlatform: boolean;
  /** What the scan actually saw, surfaced so the agent can judge it. */
  siteServedByLabel: string | null;
  /** Sub-account has its own Twilio credentials with a number on them. */
  ownsPhoneNumber: boolean;
  /** resendConfig verified — email leaves from the agent's own domain. */
  ownsEmailDomain: boolean;
  /** A completed import that actually moved contact records. */
  contactsImported: boolean;
  /** At least one automation rebuilt inside AgentStack. */
  automationsRebuilt: boolean;
  acks: MigrationAcks;
}

function ackComplete(
  inputs: MigrationIndependenceInputs,
  id: MigrationAckId
): boolean {
  return Boolean(inputs.acks?.[id]?.acknowledgedAt);
}

/**
 * The cancellation checklist. Empty for an account that did not migrate from
 * anywhere — a brand-new agent has no old subscription to wind down and must
 * not be held below 100% by questions that cannot apply to them.
 */
export function buildMigrationIndependenceTasks(
  inputs: MigrationIndependenceInputs
): SiteHealthTask[] {
  // A web host in `migratedFrom` is not a subscription to cancel — see
  // PRIOR_CRM_PLATFORMS above.
  if (!isPriorCrmPlatform(inputs.migratedFrom)) return [];
  const from = inputs.migratedFromLabel ?? "your old platform";

  return [
    {
      id: "independence-website",
      title: `Move your website off ${from}`,
      detail: inputs.siteConfirmedOffPlatform
        ? `Your site is served by ${inputs.siteServedByLabel ?? "another host"} — cancelling ${from} will not take it down.`
        : !inputs.siteVerifiedLive
          ? "We could not confirm your website is live yet, so we cannot tell who serves it."
          : inputs.siteServedByLabel
            ? `Your site appears to be served by ${inputs.siteServedByLabel}. Confirm it no longer depends on ${from}.`
            : `We could not identify who serves your site, so we cannot prove it is off ${from}. Check and confirm.`,
      // A confirmed non-match passes on its own. An inconclusive scan needs
      // the agent to look and say so — never an automatic pass.
      complete:
        inputs.siteVerifiedLive &&
        (inputs.siteConfirmedOffPlatform ||
          ackComplete(inputs, "website_independent")),
      href: "/domain",
      action: "Check my website",
    },
    {
      id: "independence-phone",
      title: "Port your phone number to your own account",
      detail: `A number still living inside ${from} can be released when you cancel — and a released number cannot be recovered.`,
      complete: inputs.ownsPhoneNumber,
      href: "/dashboard/settings?tab=messaging",
      action: "Set up SMS",
    },
    {
      id: "independence-email",
      title: "Send email from your own verified domain",
      detail: `Until this is verified, follow-up email depends on sending infrastructure you are about to cancel.`,
      complete: inputs.ownsEmailDomain,
      href: "/dashboard/settings",
      action: "Verify email domain",
    },
    {
      id: "independence-data",
      title: `Import your contacts and deals from ${from}`,
      detail: "Contacts, opportunities, and notes must be in AgentStack before the source account goes away.",
      complete: inputs.contactsImported,
      href: "/import",
      action: "Run import",
    },
    {
      id: "independence-conversations",
      title: "Save your conversation history",
      detail: `Message history does not transfer automatically. Export it from ${from} and keep the file — it cannot be retrieved after cancellation.`,
      complete: ackComplete(inputs, "conversations_saved"),
      href: "/conversations",
      action: "I have saved it",
    },
    {
      id: "independence-automations",
      title: "Rebuild your automations",
      detail: `Workflows, campaigns, and triggers do not transfer. Anything still running in ${from} stops the day you cancel.`,
      complete:
        inputs.automationsRebuilt || ackComplete(inputs, "calendars_rebuilt"),
      href: "/workflows",
      action: "Open Follow-Up Plans",
    },
    {
      id: "independence-backup",
      title: `Export a full backup from ${from}`,
      detail: "Take a complete export and store it somewhere safe before you cancel, so a missed item is still recoverable.",
      complete: ackComplete(inputs, "backup_exported"),
      href: "/import",
      action: "I have exported it",
    },
  ];
}

export interface CancellationReadiness {
  ready: boolean;
  blocking: string[];
  /** Null when the account never migrated from anywhere. */
  platformLabel: string | null;
}

/** Whether the agent can safely cancel the platform they came from. */
export function assessCancellationReadiness(
  inputs: MigrationIndependenceInputs
): CancellationReadiness {
  const tasks = buildMigrationIndependenceTasks(inputs);
  return {
    ready: tasks.length > 0 && tasks.every((task) => task.complete),
    blocking: tasks.filter((t) => !t.complete).map((t) => t.id),
    platformLabel: inputs.migratedFromLabel,
  };
}
