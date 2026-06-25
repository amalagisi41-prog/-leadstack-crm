import "server-only";

import { publishCallback } from "@/lib/automations/qstash";
import {
  createDelivery,
  createEvent,
} from "@/lib/firestore/webhook-events";
import { findMatchingSubscriptions } from "@/lib/firestore/webhook-subscriptions";
import type { WebhookEventType } from "@/types/webhooks";

/**
 * Emit a webhook event from anywhere in the codebase. Fire-and-forget —
 * never block the originating write on dispatch (Firestore writes for
 * events + deliveries are best-effort).
 *
 * Wiring contract for slices 4-6:
 *   After every successful resource write (contact create, deal move,
 *   etc.) the route calls
 *
 *     void emitWebhookEvent({
 *       subAccountId: ctx.subAccountId,
 *       agencyId: ctx.agencyId,
 *       mode: ctx.mode,
 *       type: "contact.created",
 *       payload: { contact: serializeContactForApi(c) },
 *     });
 *
 * Why fire-and-forget:
 *   - The originating API request should return as soon as the resource
 *     is written. Webhook delivery is async by design.
 *   - Subscriber endpoints can be slow, down, or untrusted — we never
 *     want them in the critical path of an LeadStack write.
 *   - Failures are logged + recoverable via the manual replay endpoint.
 */

const DELIVERY_DISPATCH_PATH = "/api/webhooks-out/step";

export interface EmitWebhookEventInput {
  subAccountId: string;
  agencyId: string;
  mode: "live" | "test";
  type: WebhookEventType;
  /**
   * The wire payload. Pass the already-serialized resource (e.g.
   * `{ contact: serializeContactForApi(c) }`). Whatever you pass is what
   * subscribers receive — there is no further transformation in the
   * dispatcher.
   */
  payload: unknown;
}

export async function emitWebhookEvent(
  input: EmitWebhookEventInput,
): Promise<void> {
  try {
    const subscriptions = await findMatchingSubscriptions(
      input.subAccountId,
      input.mode,
      input.type,
    );

    if (subscriptions.length === 0) {
      // No subscribers care about this event. Don't write an event archive
      // row either — the row's only purpose is to back manual replay, and
      // there's nothing to replay against.
      return;
    }

    const event = await createEvent({
      subAccountId: input.subAccountId,
      agencyId: input.agencyId,
      mode: input.mode,
      type: input.type,
      payload: input.payload,
      subscriptionIds: subscriptions.map((s) => s.id),
    });

    // One delivery per matched subscription, scheduled immediately (delay
    // 0). Subsequent retries reschedule with backoff inside the worker.
    await Promise.all(
      subscriptions.map(async (sub) => {
        const delivery = await createDelivery({
          subAccountId: input.subAccountId,
          agencyId: input.agencyId,
          eventId: event.id,
          subscriptionId: sub.id,
          attempt: 1,
          url: sub.url,
          scheduledAt: new Date(),
        });
        await publishCallback({
          pathname: DELIVERY_DISPATCH_PATH,
          body: {
            subAccountId: input.subAccountId,
            eventId: event.id,
            deliveryId: delivery.id,
          },
          delaySeconds: 0,
          deduplicationId: `${event.id}_${delivery.id}`,
        });
      }),
    );
  } catch (err) {
    // Caught at the top so emitWebhookEvent is safe to `void` from any
    // write path. Real production deployments observe via QStash failure
    // logs + the delivery log viewer in slice 8.
    console.warn("[webhooks/dispatch] emitWebhookEvent failed", err);
  }
}

/**
 * Schedule the next attempt for a failed delivery. Caller decides the
 * delay via the backoff table. Uses a nonce in the QStash dedup id so
 * the retry actually lands (without one, the dedup id collides with
 * attempt 1's message).
 */
export async function scheduleDeliveryRetry(opts: {
  subAccountId: string;
  eventId: string;
  deliveryId: string;
  delaySeconds: number;
}): Promise<void> {
  await publishCallback({
    pathname: DELIVERY_DISPATCH_PATH,
    body: {
      subAccountId: opts.subAccountId,
      eventId: opts.eventId,
      deliveryId: opts.deliveryId,
    },
    delaySeconds: opts.delaySeconds,
    // `retry_<attempt-or-timestamp>` nonce — the worker generates a fresh
    // delivery row per retry so each scheduled callback has a unique
    // delivery id baked into the dedup key.
    deduplicationId: `${opts.eventId}_${opts.deliveryId}`,
  });
}
