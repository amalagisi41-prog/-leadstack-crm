import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import {
  createDelivery,
  createEvent,
} from "@/lib/firestore/webhook-events";
import { getSubscription } from "@/lib/firestore/webhook-subscriptions";
import { scheduleDeliveryRetry } from "@/lib/api/webhooks/dispatch";
import type { WebhookEventType } from "@/types/webhooks";

/**
 * Send a synthetic webhook event to one specific subscription.
 *
 * Stripe-style "Send test event" affordance — lets non-technical
 * agencies verify their Zap / Make / custom endpoint is wired up
 * BEFORE going live. The synthetic envelope flows through the same
 * dispatcher, signing, retry, and delivery-log pipeline as a real
 * event, so what subscribers see in test matches production exactly.
 *
 * Behaviour:
 *   - Picks the event type to fire: caller may pass `?type=<event-type>`
 *     in the body; defaults to the FIRST event-type the subscription is
 *     subscribed to. Falls back to `contact.created` if subscribed to
 *     everything.
 *   - Builds a representative sample payload (see SAMPLE_PAYLOADS below).
 *     Stripe doesn't flag test events with anything special; we follow
 *     that — the visible difference is the realistic-but-obviously-fake
 *     identifier like `contact_test_xxx`.
 *   - Creates the same `webhookEvents/{eventId}` + `deliveries/{deliveryId}`
 *     pair a real event would create. The delivery log shows test events
 *     alongside real ones; the operator can re-trigger from the same UI.
 *
 * Auth: sub-account admin (agency owners count). Same model as the
 * subscription CRUD routes.
 */

interface TestBody {
  type?: WebhookEventType;
}

function sampleId(prefix: string): string {
  return `${prefix}_test_${Math.random().toString(36).slice(2, 10)}`;
}

const SAMPLE_PAYLOADS: Record<WebhookEventType, () => unknown> = {
  "contact.created": () => ({
    contact: {
      id: sampleId("contact"),
      object: "contact",
      livemode: true,
      name: "Test Contact",
      email: "test@example.com",
      phone: "+15555550100",
      company: "Acme Test Co.",
      address: null,
      source: "test-event",
      tags: ["test"],
      pipeline_stage: null,
      territory_id: "global",
      email_opted_out: false,
      sms_opted_out: false,
      attribution: null,
      location: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  }),
  "contact.updated": () => ({
    contact: {
      id: sampleId("contact"),
      object: "contact",
      livemode: true,
      name: "Test Contact (updated)",
      email: "test@example.com",
      phone: "+15555550100",
      tags: ["test", "updated"],
      pipeline_stage: "qualified",
      created_at: new Date(Date.now() - 86400000).toISOString(),
      updated_at: new Date().toISOString(),
    },
  }),
  "contact.deleted": () => ({
    contact: { id: sampleId("contact"), object: "contact", deleted: true },
  }),
  "deal.created": () => {
    const contactId = sampleId("contact");
    return {
      deal: {
        id: sampleId("deal"),
        object: "deal",
        livemode: true,
        title: "Test Deal",
        value: 5000,
        currency: "USD",
        stage: "new",
        priority: "medium",
        contact_id: contactId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        stage_changed_at: new Date().toISOString(),
      },
      // Contact summary embedded so subscribers get the email inline.
      contact: {
        id: contactId,
        name: "Test Contact",
        email: "test@example.com",
        phone: "+15555550100",
      },
    };
  },
  "deal.updated": () => SAMPLE_PAYLOADS["deal.created"](),
  "deal.deleted": () => {
    const base = SAMPLE_PAYLOADS["deal.created"]() as {
      deal: Record<string, unknown>;
      contact: unknown;
    };
    return { deal: { ...base.deal, deleted: true }, contact: base.contact };
  },
  "deal.stage.changed": () => {
    const contactId = sampleId("contact");
    return {
      deal: {
        id: sampleId("deal"),
        object: "deal",
        livemode: true,
        title: "Test Deal",
        value: 5000,
        currency: "USD",
        stage: "qualified",
        priority: "medium",
        contact_id: contactId,
        created_at: new Date(Date.now() - 86400000).toISOString(),
        updated_at: new Date().toISOString(),
        stage_changed_at: new Date().toISOString(),
      },
      contact: {
        id: contactId,
        name: "Test Contact",
        email: "test@example.com",
        phone: "+15555550100",
      },
      previous_stage: "contacted",
    };
  },
  "deal.won": () => {
    const base = SAMPLE_PAYLOADS["deal.created"]() as {
      deal: Record<string, unknown>;
      contact: unknown;
    };
    return { deal: { ...base.deal, stage: "won" }, contact: base.contact };
  },
  "deal.lost": () => {
    const base = SAMPLE_PAYLOADS["deal.created"]() as {
      deal: Record<string, unknown>;
      contact: unknown;
    };
    return {
      deal: { ...base.deal, stage: "lost", lost_reason: "Test rejection" },
      contact: base.contact,
    };
  },
  "task.created": () => ({
    task: {
      id: sampleId("task"),
      object: "task",
      livemode: true,
      title: "Test task",
      notes: "Sample notes",
      due_at: new Date(Date.now() + 86400000).toISOString(),
      completed: false,
      completed_at: null,
      contact_id: sampleId("contact"),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  }),
  "task.completed": () => ({
    task: {
      id: sampleId("task"),
      object: "task",
      livemode: true,
      title: "Test task",
      completed: true,
      completed_at: new Date().toISOString(),
      contact_id: sampleId("contact"),
      created_at: new Date(Date.now() - 3600000).toISOString(),
      updated_at: new Date().toISOString(),
    },
  }),
  "event.created": () => ({
    event: {
      id: sampleId("event"),
      object: "event",
      livemode: true,
      title: "Test calendar event",
      start_at: new Date(Date.now() + 3600000).toISOString(),
      end_at: new Date(Date.now() + 7200000).toISOString(),
      contact_id: sampleId("contact"),
      status: "scheduled",
      source: "manual",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  }),
  "form.submitted": () => ({
    submission: {
      id: sampleId("sub"),
      object: "form_submission",
      form_id: sampleId("form"),
      contact: (SAMPLE_PAYLOADS["contact.created"]() as { contact: unknown }).contact,
      values: { name: "Test Contact", email: "test@example.com", phone: "+15555550100" },
    },
  }),
  "quote.sent": () => ({
    quote: {
      id: sampleId("quote"),
      object: "quote",
      number: "Q-2026-TEST",
      total: 5000,
      currency: "USD",
      status: "sent",
      contact_id: sampleId("contact"),
      sent_at: new Date().toISOString(),
    },
  }),
  "quote.viewed": () => SAMPLE_PAYLOADS["quote.sent"](),
  "quote.accepted": () => ({
    quote: { ...((SAMPLE_PAYLOADS["quote.sent"]() as { quote: unknown }).quote as Record<string, unknown>), status: "accepted", accepted_at: new Date().toISOString() },
  }),
  "quote.declined": () => ({
    quote: { ...((SAMPLE_PAYLOADS["quote.sent"]() as { quote: unknown }).quote as Record<string, unknown>), status: "declined", decline_reason: "Test rejection" },
  }),
  "quote.paid": () => ({
    quote: { ...((SAMPLE_PAYLOADS["quote.sent"]() as { quote: unknown }).quote as Record<string, unknown>), status: "paid", paid_at: new Date().toISOString() },
  }),
  "booking.created": () => ({
    booking: {
      id: sampleId("booking"),
      object: "booking",
      slug: "discovery-call",
      contact_id: sampleId("contact"),
      start_at: new Date(Date.now() + 86400000).toISOString(),
      end_at: new Date(Date.now() + 86400000 + 1800000).toISOString(),
      created_at: new Date().toISOString(),
    },
  }),
  "booking.cancelled": () => ({
    booking: {
      id: sampleId("booking"),
      object: "booking",
      cancelled_at: new Date().toISOString(),
      cancel_reason: "Test cancellation",
    },
  }),
  "voice.call.completed": () => ({
    call: {
      id: sampleId("call"),
      object: "voice_call",
      caller_phone: "+15555550100",
      duration_seconds: 142,
      summary: "Caller asked about pricing. Test event.",
      contact_id: sampleId("contact"),
      ended_at: new Date().toISOString(),
    },
  }),
  "voice.call.captured": () => ({
    call: {
      id: sampleId("call"),
      object: "voice_call",
      caller_phone: "+15555550100",
      summary: "Caller provided email + requested callback. Test event.",
      captured: { email: "test@example.com", callback_requested: true },
      contact: (SAMPLE_PAYLOADS["contact.created"]() as { contact: unknown }).contact,
    },
  }),
  "webchat.lead.captured": () => ({
    session: {
      id: sampleId("ses"),
      object: "webchat_session",
      page_url: "https://example.com/pricing",
      messages_count: 4,
    },
    contact: (SAMPLE_PAYLOADS["contact.created"]() as { contact: unknown }).contact,
  }),
  "member.invited": () => ({
    invite: {
      id: sampleId("inv"),
      object: "invite",
      email: "newteammate@example.com",
      role: "collaborator",
      invited_by_uid: "user_test_xxx",
      created_at: new Date().toISOString(),
    },
  }),
  "automation.completed": () => ({
    execution: {
      id: sampleId("exec"),
      object: "automation_execution",
      recipe_type: "instant_response",
      automation_id: sampleId("auto"),
      contact_id: sampleId("contact"),
      steps_completed: 3,
      completed_at: new Date().toISOString(),
    },
  }),
  "community.member.joined": () => ({
    groupId: sampleId("grp"),
    memberId: sampleId("mbr"),
    via: "open",
  }),
  "community.member.approved": () => ({
    groupId: sampleId("grp"),
    memberId: sampleId("mbr"),
  }),
  "community.purchase.paid": () => ({
    purchaseId: sampleId("pur"),
    groupId: sampleId("grp"),
    memberId: sampleId("mbr"),
    scope: "course",
    targetId: sampleId("crs"),
    amountCents: 4900,
    currency: "USD",
  }),
  "community.lesson.completed": () => ({
    groupId: sampleId("grp"),
    courseId: sampleId("crs"),
    lessonId: sampleId("les"),
    memberId: sampleId("mbr"),
    progressPct: 50,
  }),
  "community.course.completed": () => ({
    groupId: sampleId("grp"),
    courseId: sampleId("crs"),
    memberId: sampleId("mbr"),
  }),
};

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string; subId: string }> },
) {
  const { id: subAccountId, subId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const subscription = await getSubscription(subAccountId, subId);
  if (!subscription || subscription.subAccountId !== subAccountId) {
    return NextResponse.json({ error: "Subscription not found" }, { status: 404 });
  }
  if (subscription.status === "paused") {
    return NextResponse.json(
      {
        error:
          "Subscription is paused. Resume it before sending a test event.",
      },
      { status: 400 },
    );
  }

  let body: TestBody = {};
  try {
    body = (await request.json()) as TestBody;
  } catch {
    // Empty body is fine — we'll pick a sensible default below.
  }

  // Pick the event type to fire:
  //   1. Explicit ?type=... in body (must be one the subscription cares about)
  //   2. First subscribed event type (or contact.created if subscribed to all)
  let type: WebhookEventType;
  if (body.type) {
    if (subscription.events.length > 0 && !subscription.events.includes(body.type)) {
      return NextResponse.json(
        {
          error: `Subscription is not subscribed to '${body.type}'. Add it to the event list first.`,
        },
        { status: 400 },
      );
    }
    type = body.type;
  } else if (subscription.events.length === 0) {
    type = "contact.created";
  } else {
    type = subscription.events[0]!;
  }

  const payload = SAMPLE_PAYLOADS[type]();

  // Persist as a real event + delivery pair so the test shows up in the
  // delivery log alongside real events. Operators can re-trigger from
  // the standard replay flow if they want to debug.
  const event = await createEvent({
    subAccountId,
    agencyId: subscription.agencyId,
    mode: subscription.mode,
    type,
    payload,
    subscriptionIds: [subscription.id],
  });
  const delivery = await createDelivery({
    subAccountId,
    agencyId: subscription.agencyId,
    eventId: event.id,
    subscriptionId: subscription.id,
    attempt: 1,
    url: subscription.url,
    scheduledAt: new Date(),
  });
  await scheduleDeliveryRetry({
    subAccountId,
    eventId: event.id,
    deliveryId: delivery.id,
    delaySeconds: 0,
  });

  return NextResponse.json({
    ok: true,
    eventId: event.id,
    deliveryId: delivery.id,
    type,
    message: `Test event '${type}' dispatched. Check your endpoint within ~10 seconds.`,
  });
}
