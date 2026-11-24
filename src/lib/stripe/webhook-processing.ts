import { randomUUID } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import type Stripe from "stripe";
import { getAdminDb } from "@/lib/firebase/admin";
import {
  deliverWebhookAnalytics,
  type WebhookAnalytics,
} from "@/lib/analytics/webhook";
import {
  readSubscriptionRecords,
  writeSubscriptionState,
} from "./subscription-state";
import {
  handleCheckoutCompleted,
  handleSubscriptionUpdated,
  handleSubscriptionDeleted,
} from "./webhooks";

function stripeId(value: string | { id: string } | null | undefined) {
  return typeof value === "string" ? value : value?.id;
}

export async function processStripeWebhook(
  event: Stripe.Event
): Promise<{ duplicate: boolean }> {
  if (!event.id)
    throw new Error("Verified Stripe event is missing its event ID");
  const db = getAdminDb();
  const ledger = db.doc(`processedWebhookEvents/${event.id}`);
  const owner = randomUUID();
  const claimed = await db.runTransaction(async (transaction) => {
    const existing = await transaction.get(ledger);
    const data = existing.data();
    if (data?.status === "processed") return false;
    if (data?.status === "processing" && data.leaseUntil > Date.now()) {
      throw new Error(
        `Stripe event ${event.id} is already processing; retry delivery`
      );
    }
    transaction.set(
      ledger,
      {
        eventId: event.id,
        type: event.type,
        livemode: event.livemode,
        receivedAt: data?.receivedAt ?? FieldValue.serverTimestamp(),
        status: "processing",
        owner,
        leaseUntil: Date.now() + 300_000,
        attempts: (data?.attempts ?? 0) + 1,
        error: null,
      },
      { merge: true }
    );
    return true;
  });
  if (!claimed) {
    console.info("[stripe-webhook] duplicate skipped", { eventId: event.id });
    return { duplicate: true };
  }
  try {
    switch (event.type) {
      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = stripeId(
          invoice.parent?.subscription_details?.subscription
        );
        const customerId = stripeId(invoice.customer);
        await db.runTransaction(async (transaction) => {
          const checkpoint = (await transaction.get(ledger)).data();
          if (checkpoint?.owner !== owner)
            throw new Error("Webhook processing lease lost");
          // Recover after a final ledger-write failure without repeating activation.
          if (checkpoint?.activationChecked) return;
          let result = "ignored_non_subscription_or_unpaid_invoice";
          let workspacePaths: string[] = [];
          if (
            invoice.status === "paid" &&
            invoice.amount_paid > 0 &&
            subscriptionId &&
            customerId
          ) {
            const records = await readSubscriptionRecords(
              transaction,
              customerId,
              subscriptionId
            );
            workspacePaths = records.map((record) => record.ref.path);
            const activated = writeSubscriptionState(
              transaction,
              records,
              "active",
              {
                subscriptionId,
                stripeCustomerId: customerId,
              }
            );
            result = activated ? "activated" : "already_active";
            if (activated) {
              const analytics: WebhookAnalytics = {
                event: "subscription_activated",
                stripeEventId: event.id,
                distinctId: customerId,
                payload: {
                  stripe_event_id: event.id,
                  invoice_id: invoice.id,
                  subscription_id: subscriptionId,
                  customer_id: customerId,
                  workspace_id: records[0].id,
                  is_test:
                    !event.livemode ||
                    invoice.metadata?.agentstack_verification === "true",
                },
              };
              transaction.create(db.doc(`pendingAnalytics/${event.id}`), {
                ...analytics,
                status: "pending",
                error: null,
                deliveries: {},
                createdAt: FieldValue.serverTimestamp(),
              });
            }
          }
          transaction.set(
            ledger,
            {
              activationChecked: true,
              result,
              workspacePaths,
              invoiceId: invoice.id,
              customerId: customerId ?? null,
              subscriptionId: subscriptionId ?? null,
            },
            { merge: true }
          );
        });
        break;
      }
      case "checkout.session.completed":
        await handleCheckoutCompleted(
          event.data.object as Stripe.Checkout.Session
        );
        break;
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        if (event.type === "customer.subscription.deleted")
          await handleSubscriptionDeleted(subscription);
        else await handleSubscriptionUpdated(subscription);
        if (
          event.type === "customer.subscription.deleted" ||
          subscription.cancel_at_period_end ||
          subscription.cancel_at
        ) {
          const customerId = stripeId(subscription.customer);
          if (!customerId)
            throw new Error(`Subscription ${subscription.id} has no customer`);
          const ref = db.doc(`pendingAnalytics/${event.id}`);
          try {
            await ref.create({
              event: "subscription_cancelled",
              stripeEventId: event.id,
              distinctId: customerId,
              payload: {
                stripe_event_id: event.id,
                subscription_id: subscription.id,
                customer_id: customerId,
                is_test: !event.livemode,
              },
              status: "pending",
              error: null,
              deliveries: {},
              createdAt: FieldValue.serverTimestamp(),
            });
          } catch (error) {
            if ((error as { code?: number }).code !== 6) throw error;
          }
        }
        break;
      }
      default:
        console.info("[stripe-webhook] ignored event", {
          eventId: event.id,
          type: event.type,
        });
    }
    await deliverWebhookAnalytics(event.id);
    await db.runTransaction(async (transaction) => {
      const checkpoint = (await transaction.get(ledger)).data();
      if (checkpoint?.owner !== owner)
        throw new Error("Webhook processing lease lost");
      transaction.set(
        ledger,
        {
          status: "processed",
          processedAt: FieldValue.serverTimestamp(),
          leaseUntil: 0,
          processingResult: checkpoint.result ?? "handled",
        },
        { merge: true }
      );
    });
    console.info("[stripe-webhook] processed", {
      eventId: event.id,
      type: event.type,
    });
    return { duplicate: false };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown webhook error";
    console.error("[stripe-webhook] processing failed", {
      eventId: event.id,
      error: message,
    });
    await db
      .runTransaction(async (transaction) => {
        const checkpoint = (await transaction.get(ledger)).data();
        if (checkpoint?.owner === owner) {
          transaction.set(
            ledger,
            { status: "failed", error: message, leaseUntil: 0 },
            { merge: true }
          );
        }
      })
      .catch((failure) => {
        console.error("[stripe-webhook] failed to persist failure", {
          eventId: event.id,
          error: String(failure),
        });
      });
    throw error;
  }
}
