import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import {
  deleteSubscription,
  getSubscription,
  subscriptionToResponse,
  updateSubscription,
} from "@/lib/firestore/webhook-subscriptions";
import {
  WEBHOOK_EVENT_TYPES,
  type WebhookEventType,
  type WebhookSubscriptionStatus,
} from "@/types/webhooks";
import { eventsAreSingleCategory } from "@/lib/webhooks/event-categories";

const EVENT_SET = new Set(WEBHOOK_EVENT_TYPES);
const VALID_STATUS: WebhookSubscriptionStatus[] = ["active", "paused"];

interface PatchBody {
  url?: string;
  description?: string | null;
  events?: string[];
  /** Manual resume / manual pause. Circuit-breaker pauses are also cleared by status: "active". */
  status?: WebhookSubscriptionStatus;
}

/**
 * GET    — fetch a single subscription (without signingSecret).
 * PATCH  — edit url / events / description / status.
 *          Setting status: "active" on a circuit-breaker-paused subscription
 *          ALSO resets `consecutiveFailures` to 0 (see updateSubscription
 *          in firestore/webhook-subscriptions.ts).
 * DELETE — remove the subscription. In-flight deliveries marked
 *          subscription_deleted in the delivery worker.
 */

export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string; subId: string }> },
) {
  const { id: subAccountId, subId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const doc = await getSubscription(subAccountId, subId);
  if (!doc || doc.subAccountId !== subAccountId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ subscription: subscriptionToResponse(doc) });
}

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string; subId: string }> },
) {
  const { id: subAccountId, subId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const doc = await getSubscription(subAccountId, subId);
  if (!doc || doc.subAccountId !== subAccountId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const patch: Parameters<typeof updateSubscription>[2] = {};

  if (body.url !== undefined) {
    try {
      const url = new URL(body.url);
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        return NextResponse.json(
          { error: "URL must use http or https." },
          { status: 400 },
        );
      }
      patch.url = url.toString();
    } catch {
      return NextResponse.json({ error: "Invalid URL." }, { status: 400 });
    }
  }

  if (body.events !== undefined) {
    if (!Array.isArray(body.events)) {
      return NextResponse.json(
        { error: "events must be an array." },
        { status: 400 },
      );
    }
    for (const e of body.events) {
      if (!EVENT_SET.has(e as WebhookEventType)) {
        return NextResponse.json(
          { error: `Unknown event type '${e}'.` },
          { status: 400 },
        );
      }
    }
    if (!eventsAreSingleCategory(body.events as WebhookEventType[])) {
      return NextResponse.json(
        {
          error:
            "A webhook can only subscribe to events from one category. Create a separate webhook per category.",
        },
        { status: 400 },
      );
    }
    patch.events = body.events as WebhookEventType[];
  }

  if (body.description !== undefined) {
    patch.description =
      typeof body.description === "string" && body.description.trim()
        ? body.description.trim().slice(0, 120)
        : null;
  }

  if (body.status !== undefined) {
    if (!VALID_STATUS.includes(body.status)) {
      return NextResponse.json(
        { error: `Status must be one of: ${VALID_STATUS.join(", ")}.` },
        { status: 400 },
      );
    }
    patch.status = body.status;
    // Manual pauses get a distinct reason so the UI can show "you paused
    // this" vs "the circuit breaker paused this".
    if (body.status === "paused") patch.pausedReason = "manual";
  }

  await updateSubscription(subAccountId, subId, patch);
  const updated = await getSubscription(subAccountId, subId);
  return NextResponse.json({
    subscription: updated ? subscriptionToResponse(updated) : null,
  });
}

export async function DELETE(
  request: Request,
  ctx: { params: Promise<{ id: string; subId: string }> },
) {
  const { id: subAccountId, subId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const doc = await getSubscription(subAccountId, subId);
  if (!doc || doc.subAccountId !== subAccountId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  await deleteSubscription(subAccountId, subId);
  return NextResponse.json({ ok: true });
}
