import "server-only";

import { getAdminDb } from "@/lib/firebase/admin";
import { fireWorkflowTrigger } from "@/lib/workflows/engine";
import {
  matchesTodayMonthDay,
  yearInTimezone,
} from "@/lib/workflows/time-trigger-dates";
import type { WorkflowDoc, WorkflowTriggerType } from "@/types/workflows";
import type { Contact } from "@/types/contacts";
import type { SubAccountDoc } from "@/types";

/**
 * Daily sweep for the 3 time-based Smart Workflows triggers
 * (`contact.birthday`, `contact.home_anniversary`, `contact.stale`) — the
 * only triggers that fire because time passed rather than a write happening.
 * Fanned out one sub-account at a time by
 * `/api/cron/workflow-time-triggers/step` (itself fanned out daily by
 * `/api/cron/workflow-time-triggers`, mirroring the IDX listing-sync cron).
 *
 * Reuses the existing `fireWorkflowTrigger()` engine entry point unchanged —
 * this module's only job is finding the (workflow, contact) pairs that
 * match today, and doing so at most once per relevant window (see the dedup
 * notes below).
 */

const TIME_TRIGGER_TYPES: WorkflowTriggerType[] = [
  "contact.birthday",
  "contact.home_anniversary",
  "contact.stale",
];

function toMillis(v: unknown): number | null {
  const m = v as { toMillis?: () => number } | null;
  return m && typeof m.toMillis === "function" ? m.toMillis() : null;
}

/** Most recent `workflowRuns.enrolledAt` (ms) for this (workflow, contact)
 *  pair, or null if they've never been enrolled by it. Two equality filters
 *  — no composite index required (same reasoning as the 3-equality-filter
 *  query in `fireWorkflowTrigger`). */
async function mostRecentRunMs(
  workflowId: string,
  contactId: string,
): Promise<number | null> {
  const snap = await getAdminDb()
    .collection("workflowRuns")
    .where("workflowId", "==", workflowId)
    .where("contactId", "==", contactId)
    .get();
  let latest: number | null = null;
  for (const doc of snap.docs) {
    const ms = toMillis(doc.data().enrolledAt);
    if (ms !== null && (latest === null || ms > latest)) latest = ms;
  }
  return latest;
}

export interface TimeTriggerSweepResult {
  evaluated: number;
  fired: number;
}

/**
 * Evaluates every active time-based-trigger workflow in one sub-account
 * against every contact in it, firing (and dedup-guarding) matches. Never
 * throws — logs and returns a zeroed result on failure, same posture as
 * `fireWorkflowTrigger` itself.
 */
export async function evaluateTimeTriggersForSubAccount(
  subAccountId: string,
): Promise<TimeTriggerSweepResult> {
  const result: TimeTriggerSweepResult = { evaluated: 0, fired: 0 };
  const db = getAdminDb();

  try {
    const subSnap = await db.doc(`subAccounts/${subAccountId}`).get();
    if (!subSnap.exists) return result;
    const sub = subSnap.data() as SubAccountDoc;
    if (sub.automationsPaused === true) return result;
    const timezone = sub.sendWindow?.timezone || "UTC";

    const workflowsSnap = await db
      .collection("workflows")
      .where("subAccountId", "==", subAccountId)
      .where("status", "==", "active")
      .where("trigger.type", "in", TIME_TRIGGER_TYPES)
      .get();
    if (workflowsSnap.empty) return result;

    const workflows = workflowsSnap.docs
      .map((d) => ({ id: d.id, ...(d.data() as Omit<WorkflowDoc, "id">) }))
      .filter((wf) => !!wf.startNodeId);
    if (!workflows.length) return result;

    const contactsSnap = await db
      .collection("contacts")
      .where("subAccountId", "==", subAccountId)
      .get();

    const now = Date.now();
    const thisYear = yearInTimezone(now, timezone);

    for (const cdoc of contactsSnap.docs) {
      const contact = {
        id: cdoc.id,
        ...(cdoc.data() as Omit<Contact, "id">),
      };
      result.evaluated += 1;

      for (const wf of workflows) {
        let matched = false;

        if (wf.trigger.type === "contact.birthday") {
          matched = matchesTodayMonthDay(contact.birthday, timezone, new Date(now));
        } else if (wf.trigger.type === "contact.home_anniversary") {
          matched = matchesTodayMonthDay(
            contact.homeAnniversary,
            timezone,
            new Date(now),
          );
        } else if (wf.trigger.type === "contact.stale") {
          const staleDays = wf.trigger.staleDays;
          if (staleDays && staleDays > 0) {
            const lastContactMs = Math.max(
              toMillis(contact.lastContactedAt) ?? 0,
              toMillis(contact.lastOutboundCallAt) ?? 0,
            );
            if (lastContactMs > 0) {
              const days = Math.floor((now - lastContactMs) / 86_400_000);
              matched = days >= staleDays;
            }
          }
        }

        if (!matched) continue;

        const lastRunMs = await mostRecentRunMs(wf.id, contact.id);

        if (wf.trigger.type === "contact.stale") {
          // Only re-fire after the contact has actually been re-contacted
          // since the last time we flagged them (i.e. lastRun predates the
          // most recent real touch). Otherwise a daily sweep would re-enroll
          // the same still-stale contact every single day.
          const lastContactMs = Math.max(
            toMillis(contact.lastContactedAt) ?? 0,
            toMillis(contact.lastOutboundCallAt) ?? 0,
          );
          if (lastRunMs !== null && lastRunMs >= lastContactMs) continue;
        } else {
          // Birthday / home-anniversary: fire at most once per calendar year.
          if (lastRunMs !== null && yearInTimezone(lastRunMs, timezone) === thisYear) {
            continue;
          }
        }

        void fireWorkflowTrigger({
          subAccountId,
          agencyId: sub.agencyId,
          type: wf.trigger.type,
          contactId: contact.id,
        });
        result.fired += 1;
      }
    }
  } catch (err) {
    console.error(
      "[workflows] evaluateTimeTriggersForSubAccount failed",
      subAccountId,
      err,
    );
  }

  return result;
}
