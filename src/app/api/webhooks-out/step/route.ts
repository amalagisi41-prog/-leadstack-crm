import "server-only";

import { NextResponse } from "next/server";
import { verifyQStashSignature } from "@/lib/automations/qstash";
import {
  createDelivery,
  getDelivery,
  getEvent,
  updateDelivery,
} from "@/lib/firestore/webhook-events";
import {
  getSubscription,
  recordSubscriptionFailure,
  recordSubscriptionSuccess,
} from "@/lib/firestore/webhook-subscriptions";
import { scheduleDeliveryRetry } from "@/lib/api/webhooks/dispatch";
import { signWebhookPayload } from "@/lib/api/webhooks/signing";
import { LATEST_API_VERSION } from "@/lib/api/versions";

/**
 * Webhook delivery worker — QStash callback. POSTs the signed event
 * payload to the subscriber URL, applies retry/backoff/circuit-breaker
 * policy, and updates the delivery row with the outcome.
 *
 * Security: Upstash-Signature header. Route lives at `/api/webhooks-out/*`
 * and is added to PUBLIC_PATHS in middleware. The signature is the only
 * gate (matches the existing automations + broadcasts step routes).
 *
 * Retry table (attempts are 1-indexed; attempt 1 is the original send):
 *   attempt 2 → +60s
 *   attempt 3 → +300s  (5 min)
 *   attempt 4 → +1800s (30 min)
 *   beyond    → exhausted; mark failed + bump subscription circuit breaker
 *
 * After 3 retries (4 attempts total), we stop and mark the delivery
 * exhausted. Operators replay manually from the slice 8 UI when the
 * upstream comes back up.
 */

const MAX_ATTEMPTS = 4;
const RETRY_DELAYS_SEC = [60, 300, 1800];
const REQUEST_TIMEOUT_MS = 15_000;
const RESPONSE_EXCERPT_LIMIT = 2048;

interface StepBody {
  subAccountId?: string;
  eventId?: string;
  deliveryId?: string;
}

export async function POST(request: Request) {
  const signature = request.headers.get("upstash-signature");
  const rawBody = await request.text();
  if (!signature) {
    return NextResponse.json(
      { error: "Missing signature" },
      { status: 401 },
    );
  }
  const valid = await verifyQStashSignature(signature, rawBody);
  if (!valid) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let body: StepBody;
  try {
    body = JSON.parse(rawBody) as StepBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { subAccountId, eventId, deliveryId } = body;
  if (!subAccountId || !eventId || !deliveryId) {
    return NextResponse.json(
      { error: "Missing subAccountId / eventId / deliveryId" },
      { status: 400 },
    );
  }

  const [delivery, event] = await Promise.all([
    getDelivery(subAccountId, eventId, deliveryId),
    getEvent(subAccountId, eventId),
  ]);
  if (!delivery || !event) {
    // The event/delivery was deleted between schedule and run. Drop the
    // message gracefully — 200 so QStash doesn't retry.
    return NextResponse.json({ ok: true, skipped: "not_found" });
  }
  if (delivery.status !== "pending") {
    // Idempotency: a retry of this exact QStash message landed twice (or
    // someone manually fired a replay that already completed).
    return NextResponse.json({ ok: true, skipped: "not_pending" });
  }

  const subscription = await getSubscription(subAccountId, delivery.subscriptionId);
  if (!subscription) {
    await updateDelivery(subAccountId, eventId, deliveryId, {
      status: "failed",
      errorMessage: "Subscription deleted",
      attemptedAt: new Date(),
    });
    return NextResponse.json({ ok: true, skipped: "subscription_deleted" });
  }
  if (subscription.status === "paused") {
    // Subscription was paused (manually or by circuit breaker) between
    // schedule and run. Mark the delivery exhausted so the row is final;
    // operators can replay after they re-enable the subscription.
    await updateDelivery(subAccountId, eventId, deliveryId, {
      status: "exhausted",
      errorMessage: `Subscription paused (${subscription.pausedReason ?? "manual"})`,
      attemptedAt: new Date(),
    });
    return NextResponse.json({ ok: true, skipped: "subscription_paused" });
  }

  // Build the signed envelope. Same shape on first delivery and any
  // retry — subscribers consume one canonical payload.
  const envelope = {
    id: event.id,
    type: event.type,
    api_version: LATEST_API_VERSION,
    created: Math.floor(event.createdAt.getTime() / 1000),
    livemode: event.mode === "live",
    data: event.payload,
    /** Always present so consumers can correlate retries server-side. */
    delivery: {
      id: delivery.id,
      attempt: delivery.attempt,
    },
  };
  const envelopeJson = JSON.stringify(envelope);
  const signed = signWebhookPayload(subscription.signingSecret, envelopeJson);

  // POST to the subscriber URL with a hard timeout. Network errors,
  // timeouts, and non-2xx all count as failures.
  let outcome:
    | { kind: "success"; status: number; bodyExcerpt: string; headers: string }
    | { kind: "failure"; status: number | null; message: string; bodyExcerpt: string | null; headers: string | null };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(subscription.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "LeadStack-Webhooks/1.0",
        "LeadStack-Signature": signed.header,
        "LeadStack-Version": LATEST_API_VERSION,
        "Webhook-Event-Id": event.id,
        "Webhook-Event-Type": event.type,
      },
      body: envelopeJson,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    const text = await res.text().catch(() => "");
    const bodyExcerpt =
      text.length > RESPONSE_EXCERPT_LIMIT
        ? `${text.slice(0, RESPONSE_EXCERPT_LIMIT)}…(truncated, ${text.length} bytes)`
        : text;
    const headers = JSON.stringify(Object.fromEntries(res.headers.entries()));
    if (res.status >= 200 && res.status < 300) {
      outcome = {
        kind: "success",
        status: res.status,
        bodyExcerpt,
        headers,
      };
    } else {
      outcome = {
        kind: "failure",
        status: res.status,
        message: `Non-2xx response: ${res.status}`,
        bodyExcerpt,
        headers,
      };
    }
  } catch (err) {
    clearTimeout(timeoutId);
    const message =
      err instanceof Error
        ? err.name === "AbortError"
          ? `Timed out after ${REQUEST_TIMEOUT_MS}ms`
          : err.message
        : "Unknown delivery error";
    outcome = {
      kind: "failure",
      status: null,
      message,
      bodyExcerpt: null,
      headers: null,
    };
  }

  const attemptedAt = new Date();

  if (outcome.kind === "success") {
    await updateDelivery(subAccountId, eventId, deliveryId, {
      status: "succeeded",
      httpStatus: outcome.status,
      responseBody: outcome.bodyExcerpt,
      responseHeaders: outcome.headers,
      attemptedAt,
    });
    await recordSubscriptionSuccess(subAccountId, subscription.id, outcome.status);
    return NextResponse.json({ ok: true, status: outcome.status });
  }

  // Failure path. Decide: retry or exhaust?
  const nextAttempt = delivery.attempt + 1;
  const willRetry = nextAttempt <= MAX_ATTEMPTS;

  if (willRetry) {
    // Mark THIS attempt as failed; create a fresh pending delivery row for
    // the next attempt + schedule it. Separate rows per attempt keep the
    // delivery log honest about how many times we hit the subscriber URL.
    await updateDelivery(subAccountId, eventId, deliveryId, {
      status: "failed",
      httpStatus: outcome.status,
      responseBody: outcome.bodyExcerpt,
      responseHeaders: outcome.headers,
      errorMessage: outcome.message,
      attemptedAt,
      nextRetryAt: new Date(
        Date.now() + RETRY_DELAYS_SEC[delivery.attempt - 1]! * 1000,
      ),
    });
    const next = await createDelivery({
      subAccountId,
      agencyId: delivery.agencyId,
      eventId,
      subscriptionId: subscription.id,
      attempt: nextAttempt,
      url: subscription.url,
      scheduledAt: new Date(
        Date.now() + RETRY_DELAYS_SEC[delivery.attempt - 1]! * 1000,
      ),
    });
    await scheduleDeliveryRetry({
      subAccountId,
      eventId,
      deliveryId: next.id,
      delaySeconds: RETRY_DELAYS_SEC[delivery.attempt - 1]!,
    });
    // Subscription failure counter is NOT bumped here — we only count
    // toward the circuit breaker after exhausting all retries.
    return NextResponse.json({
      ok: true,
      retrying: true,
      nextAttempt,
    });
  }

  // Out of retries. Mark exhausted + count toward circuit breaker.
  await updateDelivery(subAccountId, eventId, deliveryId, {
    status: "exhausted",
    httpStatus: outcome.status,
    responseBody: outcome.bodyExcerpt,
    responseHeaders: outcome.headers,
    errorMessage: outcome.message,
    attemptedAt,
  });
  const { tripped } = await recordSubscriptionFailure(
    subAccountId,
    subscription.id,
    {
      httpStatus: outcome.status,
      errorMessage: outcome.message,
    },
  );
  if (tripped) {
    console.warn(
      "[webhooks-out] circuit breaker tripped",
      JSON.stringify({
        subAccountId,
        subscriptionId: subscription.id,
        url: subscription.url,
      }),
    );
    // Slice 8 attaches an admin email here. For v1 the paused state is
    // surfaced in the UI; admins resume after fixing the upstream.
  }
  return NextResponse.json({
    ok: true,
    exhausted: true,
    circuitTripped: tripped,
  });
}
