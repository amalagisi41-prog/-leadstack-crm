import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import {
  createDelivery,
  getEvent,
} from "@/lib/firestore/webhook-events";
import {
  getSubscription,
} from "@/lib/firestore/webhook-subscriptions";
import { scheduleDeliveryRetry } from "@/lib/api/webhooks/dispatch";

/**
 * Manual replay of an archived webhook event.
 *
 * Body: { subscriptionId } — which active subscription to deliver to. The
 * caller picks because re-firing to the entire original `subscriptionIds`
 * list often re-hits subscribers that already succeeded. Stripe-equivalent
 * behaviour: each replay targets one subscription at a time, surfaced
 * from the slice 8 UI as "Resend to <URL>".
 *
 * A replay creates a brand-new delivery row (attempt 1) and goes through
 * the same retry / circuit-breaker pipeline as an original delivery —
 * including bumping the subscription's failure counter on exhaustion.
 *
 * Auth: sub-account admin. Replays are sensitive (they re-execute the
 * subscriber's webhook handler) so collaborators don't get this.
 */

interface ReplayBody {
  subscriptionId?: string;
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string; eventId: string }> },
) {
  const { id: subAccountId, eventId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;

  let body: ReplayBody;
  try {
    body = (await request.json()) as ReplayBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const subscriptionId = body.subscriptionId?.trim();
  if (!subscriptionId) {
    return NextResponse.json(
      { error: "subscriptionId is required." },
      { status: 400 },
    );
  }

  const [event, subscription] = await Promise.all([
    getEvent(subAccountId, eventId),
    getSubscription(subAccountId, subscriptionId),
  ]);
  if (!event || event.subAccountId !== subAccountId) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }
  if (!subscription || subscription.subAccountId !== subAccountId) {
    return NextResponse.json({ error: "Subscription not found" }, { status: 404 });
  }
  if (subscription.mode !== event.mode) {
    return NextResponse.json(
      { error: "Subscription mode does not match event mode." },
      { status: 400 },
    );
  }
  if (subscription.status === "paused") {
    return NextResponse.json(
      { error: "Subscription is paused. Resume it before replaying." },
      { status: 400 },
    );
  }

  const delivery = await createDelivery({
    subAccountId,
    agencyId: event.agencyId,
    eventId,
    subscriptionId,
    attempt: 1,
    url: subscription.url,
    scheduledAt: new Date(),
  });
  await scheduleDeliveryRetry({
    subAccountId,
    eventId,
    deliveryId: delivery.id,
    delaySeconds: 0,
  });

  return NextResponse.json({
    ok: true,
    deliveryId: delivery.id,
  });
}
