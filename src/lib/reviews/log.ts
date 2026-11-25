import "server-only";

import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { publishCallback } from "@/lib/automations/qstash";
import { attemptReviewSend, type SendReviewResult } from "@/lib/reviews/request";
import { reviewReasonText, statusForOutcome } from "@/lib/reviews/reasons";
import {
  DEFAULT_REVIEW_AUTOMATION_MODE,
  DEFAULT_REVIEW_DELAY_DAYS,
  MAX_REVIEW_DELAY_DAYS,
  type ReviewAutomationMode,
  type ReviewRequestEvent,
  type ReviewRequestTrigger,
} from "@/types/review-requests";
import type { SubAccountDoc } from "@/types/tenancy";

/**
 * The review-request log. EVERY review send path writes here — the manual
 * button, the post-closing (deal won) automation, and the legacy quote-paid /
 * deal-completed / workflow triggers — so the Review Requests page is a
 * complete record and no request can fail silently.
 *
 * Post-closing automation (deal reaches Closed (won)):
 *   off       → nothing is created.
 *   log_only  → created → queued for the delay → at the send time every
 *               pre-flight check runs and the outcome is logged as
 *               "would send" or the precise failure; NOTHING is sent.
 *   live      → same flow, and at the send time it really sends.
 * The mode is re-read at send time, so switching it changes queued requests.
 */

const COLLECTION = "reviewRequests";
const DAY_MS = 24 * 60 * 60 * 1000;
export const REVIEW_STEP_PATH = "/api/reviews/requests/step";

export function automationModeOf(sub: SubAccountDoc | null | undefined): ReviewAutomationMode {
  const m = sub?.googleReviewConfig?.automationMode;
  return m === "off" || m === "live" || m === "log_only" ? m : DEFAULT_REVIEW_AUTOMATION_MODE;
}

export function delayDaysOf(sub: SubAccountDoc | null | undefined): number {
  const d = sub?.googleReviewConfig?.delayDaysAfterClosing;
  return typeof d === "number" && Number.isFinite(d)
    ? Math.min(MAX_REVIEW_DELAY_DAYS, Math.max(0, Math.round(d)))
    : DEFAULT_REVIEW_DELAY_DAYS;
}

function event(type: ReviewRequestEvent["type"], message: string): ReviewRequestEvent {
  return { at: Timestamp.now() as unknown as Date, type, message };
}

async function contactName(contactId: string): Promise<string> {
  const snap = await getAdminDb().doc(`contacts/${contactId}`).get();
  return ((snap.data()?.name as string | undefined) ?? "").trim() || "Unnamed contact";
}

/** Writes the outcome of one send attempt onto its request. */
async function recordOutcome(
  requestId: string,
  outcome: SendReviewResult,
  opts: { logOnly: boolean },
): Promise<void> {
  const status = statusForOutcome(outcome);
  const why = reviewReasonText(outcome.reason, outcome.detail);
  const via = outcome.channel ? ` via ${outcome.channel === "sms" ? "text message" : "WhatsApp"}` : "";
  const message =
    status === "sent"
      ? `Sent${via}.`
      : status === "would_send"
        ? `Would have sent${via} now — not sent because the automation is in log-only mode.`
        : opts.logOnly
          ? `Would fail — ${why}. (Log-only mode: nothing was sent.)`
          : `${status === "skipped" ? "Skipped" : "Failed"} — ${why}.`;
  await getAdminDb()
    .doc(`${COLLECTION}/${requestId}`)
    .set(
      {
        status,
        reason: outcome.sent ? null : (outcome.reason ?? "error"),
        channel: outcome.channel ?? null,
        reviewLinkSet: outcome.reason !== "not_configured",
        sentAt: outcome.sent ? FieldValue.serverTimestamp() : null,
        events: FieldValue.arrayUnion(event(status === "would_send" ? "would_send" : status === "sent" ? "sent" : status === "skipped" ? "skipped" : "failed", message)),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
}

/**
 * Immediate send with a log row — the manual button and the legacy automatic
 * triggers. Manual sends are exempt from the delay and the mode (an explicit
 * human action) and always really send; the caller gets the outcome so the UI
 * can show the exact error instead of pretending.
 */
export async function maybeSendReviewRequest(input: {
  subAccountId: string;
  agencyId: string;
  contactId: string;
  trigger: Exclude<ReviewRequestTrigger, "deal_won">;
  dealId?: string | null;
  dealTitle?: string | null;
}): Promise<SendReviewResult & { requestId: string | null }> {
  let requestId: string | null = null;
  try {
    const ref = getAdminDb().collection(COLLECTION).doc();
    requestId = ref.id;
    await ref.set({
      agencyId: input.agencyId,
      subAccountId: input.subAccountId,
      contactId: input.contactId,
      contactName: await contactName(input.contactId),
      dealId: input.dealId ?? null,
      dealTitle: input.dealTitle ?? null,
      trigger: input.trigger,
      mode: input.trigger === "manual" ? "manual" : "live",
      channel: null,
      status: "queued",
      scheduledFor: null,
      sentAt: null,
      reason: null,
      reviewLinkSet: true,
      events: [
        event(
          "created",
          input.trigger === "manual"
            ? "Requested by hand — sends immediately (no delay)."
            : `Created by the ${input.trigger.replace(/_/g, " ")} trigger — sends immediately.`,
        ),
      ],
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  } catch (err) {
    // Logging must not block a send a person explicitly asked for.
    console.error("[reviews/log] could not create request row", err);
    requestId = null;
  }

  const outcome = await attemptReviewSend({ ...input });
  if (requestId) {
    try {
      await recordOutcome(requestId, outcome, { logOnly: false });
    } catch (err) {
      console.error("[reviews/log] could not record outcome", requestId, err);
    }
  }
  return { ...outcome, requestId };
}

/**
 * Post-closing automation entry point. Called whenever a deal may have moved
 * to Closed (won) — the PATCH route and the pipeline board. Idempotent per
 * deal (doc id `deal_<dealId>`), so a deal dragged in and out of Won never
 * produces a second request.
 */
export async function enqueueDealWonReviewRequest(dealId: string): Promise<{
  created: boolean;
  status?: string;
  reason?: string;
}> {
  const db = getAdminDb();
  const dealSnap = await db.doc(`deals/${dealId}`).get();
  const deal = dealSnap.data();
  if (!deal || deal.stageId !== "won") return { created: false, reason: "not_won" };
  if (deal.isSample === true) return { created: false, reason: "sample_deal" };

  const subAccountId = deal.subAccountId as string;
  const subSnap = await db.doc(`subAccounts/${subAccountId}`).get();
  const sub = subSnap.data() as SubAccountDoc | undefined;
  const mode = automationModeOf(sub);
  if (mode === "off") return { created: false, reason: "automation_off" };

  const delayDays = delayDaysOf(sub);
  const scheduledFor = new Date(Date.now() + delayDays * DAY_MS);
  const ref = db.doc(`${COLLECTION}/deal_${dealId}`);
  const dealTitle = (deal.title as string | undefined) ?? null;

  try {
    await ref.create({
      agencyId: deal.agencyId,
      subAccountId,
      contactId: deal.contactId,
      contactName: await contactName(deal.contactId as string),
      dealId,
      dealTitle,
      trigger: "deal_won",
      mode,
      channel: sub?.googleReviewConfig?.channel ?? "sms",
      status: "queued",
      scheduledFor: Timestamp.fromDate(scheduledFor),
      sentAt: null,
      reason: null,
      reviewLinkSet: !!sub?.googleReviewConfig?.reviewUrl,
      events: [
        event(
          "created",
          `Created when "${dealTitle ?? "the deal"}" reached Closed (won). Mode: ${mode === "live" ? "Live" : "Log only"}.`,
        ),
      ],
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  } catch {
    return { created: false, reason: "already_exists" };
  }

  const published = await publishCallback({
    pathname: REVIEW_STEP_PATH,
    body: { requestId: ref.id },
    delaySeconds: Math.round(delayDays * DAY_MS / 1000),
    deduplicationId: `review_${ref.id}`,
  });
  if (!published) {
    await ref.set(
      {
        status: "failed",
        reason: "scheduling_unavailable",
        events: FieldValue.arrayUnion(
          event("failed", `Failed — ${reviewReasonText("scheduling_unavailable")}.`),
        ),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    return { created: true, status: "failed", reason: "scheduling_unavailable" };
  }
  const when = scheduledFor.toISOString();
  await ref.set(
    {
      events: FieldValue.arrayUnion(
        event(
          "queued",
          `${delayDays === 0 ? "Queued to run now" : `Queued for ${delayDays} day${delayDays === 1 ? "" : "s"} after closing`} — ${mode === "live" ? "will send" : "would send"} at ${when}.`,
        ),
      ),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  return { created: true, status: "queued" };
}

/** QStash callback body: runs one queued post-closing request at its send time. */
export async function runQueuedReviewRequest(requestId: string): Promise<void> {
  const db = getAdminDb();
  const ref = db.doc(`${COLLECTION}/${requestId}`);
  const snap = await ref.get();
  const req = snap.data();
  if (!req || req.status !== "queued") return; // retry / already handled

  const subSnap = await db.doc(`subAccounts/${req.subAccountId}`).get();
  const mode = automationModeOf(subSnap.data() as SubAccountDoc | undefined);
  if (mode === "off") {
    await ref.set(
      {
        status: "cancelled",
        reason: "automation_off",
        events: FieldValue.arrayUnion(event("cancelled", `Cancelled — ${reviewReasonText("automation_off")}.`)),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    return;
  }

  const logOnly = mode !== "live";
  const outcome = await attemptReviewSend({
    subAccountId: req.subAccountId,
    agencyId: req.agencyId,
    contactId: req.contactId,
    trigger: "deal_won",
    dryRun: logOnly,
  });
  await recordOutcome(requestId, outcome, { logOnly });
}
