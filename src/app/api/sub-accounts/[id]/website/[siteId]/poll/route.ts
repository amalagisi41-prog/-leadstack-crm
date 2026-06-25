import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import {
  publishCallback,
  qstashIsConfigured,
  verifyQStashSignature,
} from "@/lib/automations/qstash";
import { GitpageError, pollBuild } from "@/lib/gitpage/client";
import { markGitpageKeyInvalid } from "@/lib/gitpage/heartbeat";
import type { WebsiteDoc } from "@/types/website";

export const dynamic = "force-dynamic";

/**
 * QStash callback that polls gitpage for one website build's status. Each
 * tick:
 *   1. Verifies the Upstash-Signature header.
 *   2. Reads the website doc; bails if status is no longer in-flight (the
 *      operator may have hit Rebuild, or a previous tick already settled).
 *   3. Calls gitpage's status endpoint.
 *   4. Updates Firestore: success / failure / still-pending.
 *   5. If still pending and we're under the cap (15 min × 4 polls/min),
 *      reschedules itself for +20s.
 *
 * Cap math: gitpage suggests 15-30s cadence, hard stop at 15 minutes.
 * 15 minutes / 20s = 45 polls.
 */

const POLL_INTERVAL_SECONDS = 20;
const MAX_POLL_ATTEMPTS = 45;
const STALE_HEARTBEAT_MS = 5 * 60 * 1000; // 5 min — gitpage's heartbeat advice

interface PollPayload {
  subAccountId?: string;
  siteId?: string;
  formResponseId?: string;
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string; siteId: string }> },
) {
  const { id: subAccountId, siteId } = await ctx.params;

  if (!qstashIsConfigured()) {
    return NextResponse.json(
      { error: "QStash is not configured." },
      { status: 503 },
    );
  }

  const signature = request.headers.get("upstash-signature");
  if (!signature) {
    return NextResponse.json(
      { error: "Missing Upstash-Signature header" },
      { status: 401 },
    );
  }

  const rawBody = await request.text();
  const valid = await verifyQStashSignature(signature, rawBody);
  if (!valid) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: PollPayload;
  try {
    payload = JSON.parse(rawBody) as PollPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (
    payload.subAccountId !== subAccountId ||
    payload.siteId !== siteId ||
    typeof payload.formResponseId !== "string"
  ) {
    return NextResponse.json(
      { error: "Body must include subAccountId + siteId + formResponseId" },
      { status: 400 },
    );
  }

  const db = getAdminDb();
  const docRef = db.doc(`subAccounts/${subAccountId}/website/${siteId}`);
  const snap = await docRef.get();
  if (!snap.exists) {
    // Doc was deleted between scheduling and this tick — drop silently.
    return NextResponse.json({ ok: true, ignored: "doc-missing" });
  }
  const websiteDoc = snap.data() as WebsiteDoc;

  // Bail if we're not chasing this job anymore (e.g. operator rebuilt with a
  // different config, or a previous tick already settled the build).
  if (
    websiteDoc.gitpageJobId !== payload.formResponseId ||
    (websiteDoc.status !== "queued" && websiteDoc.status !== "building")
  ) {
    return NextResponse.json({ ok: true, ignored: "stale-tick" });
  }

  const attempts = (websiteDoc.pollAttempts ?? 0) + 1;

  // Cap: bail with "failed" after MAX_POLL_ATTEMPTS.
  if (attempts > MAX_POLL_ATTEMPTS) {
    await docRef.update({
      status: "failed",
      errorMessage:
        "Build is taking longer than expected (15+ min). gitpage may still finish — check the dashboard.",
      pollAttempts: attempts,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return NextResponse.json({ ok: true, settled: "timeout" });
  }

  // Heartbeat check — if the doc hasn't seen any update in 5 min AND
  // gitpage's last updatedAt is older than that too, we treat it as stuck.
  const lastBuildAt = websiteDoc.lastBuildAt as
    | FirebaseFirestore.Timestamp
    | null
    | undefined;
  const lastBuildMs = lastBuildAt?.toMillis?.() ?? 0;

  let pollResult;
  try {
    pollResult = await pollBuild(payload.formResponseId);
  } catch (err) {
    // Network / 5xx hiccups — record the attempt and reschedule. QStash's
    // built-in retry could also handle this, but failing fast on a single
    // bad poll wastes a retry slot we'd rather use for genuine flakiness.
    // gitpage's contract: 4xx is terminal for the build, 5xx + network are
    // worth retrying. 401 = bad key, 404 = job lost on their side, 429 =
    // hourly cap hit. None of these are recoverable on retry, so settle.
    if (
      err instanceof GitpageError &&
      err.status >= 400 &&
      err.status < 500
    ) {
      // 401 means the API key is invalid — same handling as the submit
      // route. Flip the cached gitpage status so the activation panel
      // surfaces the correct CTA on next page load.
      if (err.status === 401) {
        await markGitpageKeyInvalid();
      }
      await docRef.update({
        status: "failed",
        errorMessage: `gitpage rejected the poll: ${err.message}`,
        pollAttempts: attempts,
        updatedAt: FieldValue.serverTimestamp(),
      });
      return NextResponse.json({ ok: true, settled: "client-error" });
    }
    console.warn("[website/poll] gitpage poll threw — rescheduling", err);
    await docRef.update({
      pollAttempts: attempts,
      updatedAt: FieldValue.serverTimestamp(),
    });
    await rescheduleNext(
      subAccountId,
      siteId,
      payload.formResponseId,
      attempts,
    );
    return NextResponse.json({ ok: true, deferred: "transient" });
  }

  // Terminal states — update the doc and stop polling.
  if (pollResult.isTerminal) {
    if (pollResult.status === "Published") {
      await docRef.update({
        status: "ready",
        liveUrl: pollResult.pagesUrl,
        errorMessage: null,
        partialErrors: pollResult.partialErrors,
        pollAttempts: attempts,
        updatedAt: FieldValue.serverTimestamp(),
      });
      return NextResponse.json({ ok: true, settled: "ready" });
    }
    await docRef.update({
      status: "failed",
      errorMessage: pollResult.error ?? "gitpage build failed without details.",
      pollAttempts: attempts,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return NextResponse.json({ ok: true, settled: "failed" });
  }

  // Still in flight. Bump status to "building" if gitpage has moved past
  // the queued phase, record the attempt count, reschedule.
  const nextStatus =
    pollResult.statusPhase && pollResult.statusPhase !== "processing"
      ? "building"
      : websiteDoc.status;

  // Stuck-build heuristic: if our doc was queued > 5 min ago AND gitpage's
  // updatedAt hasn't moved past that mark, assume stuck. Skip when status
  // is "recovering" — that phase can legitimately sit unchanged for several
  // minutes while gitpage's internal webhook recovers, and the 15-minute
  // cap will catch a genuine hang.
  if (
    pollResult.status !== "recovering" &&
    lastBuildMs > 0 &&
    Date.now() - lastBuildMs > STALE_HEARTBEAT_MS &&
    pollResult.updatedAt &&
    new Date(pollResult.updatedAt).getTime() < Date.now() - STALE_HEARTBEAT_MS
  ) {
    await docRef.update({
      status: "failed",
      errorMessage:
        "Build appears stuck (no progress for 5+ minutes). Try Rebuild.",
      pollAttempts: attempts,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return NextResponse.json({ ok: true, settled: "stuck" });
  }

  await docRef.update({
    status: nextStatus,
    pollAttempts: attempts,
    updatedAt: FieldValue.serverTimestamp(),
  });
  const rescheduled = await rescheduleNext(
    subAccountId,
    siteId,
    payload.formResponseId,
    attempts,
  );
  if (!rescheduled) {
    // QStash publish failed — chain is dead. Mark the doc as failed
    // rather than letting it spin in queued/building forever, so the
    // operator sees a real error and can hit Rebuild (or Re-check now
    // to retry). Without this guard, a transient Upstash blip silently
    // strands the build past the 15-min cap.
    await docRef.update({
      status: "failed",
      errorMessage:
        "Couldn't schedule the next poll. Try Re-check now or Rebuild.",
      pollAttempts: attempts,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return NextResponse.json({ ok: true, settled: "reschedule-failed" });
  }
  return NextResponse.json({ ok: true, deferred: "in-progress" });
}

/**
 * Schedule the next poll tick. Each call uses a fresh deduplicationId
 * (suffixed with attempt count) so QStash treats every reschedule as a
 * new message. Returns true on success — callers must surface failure
 * (e.g. mark the doc as failed) to avoid silently stranding a build.
 */
async function rescheduleNext(
  subAccountId: string,
  siteId: string,
  formResponseId: string,
  attempts: number,
): Promise<boolean> {
  const result = await publishCallback({
    pathname: `/api/sub-accounts/${subAccountId}/website/${siteId}/poll`,
    body: { subAccountId, siteId, formResponseId },
    delaySeconds: POLL_INTERVAL_SECONDS,
    deduplicationId: `website_${subAccountId}_${siteId}_${formResponseId}_${attempts}`,
  });
  return result !== null;
}
