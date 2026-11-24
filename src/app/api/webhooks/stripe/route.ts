import { captureServerEvent } from "@/lib/analytics/server";
import { NextResponse } from "next/server";
import { getStripeServer } from "@/lib/stripe/server";
import {
  handleCheckoutCompleted,
  handleSubscriptionUpdated,
  handleSubscriptionDeleted,
} from "@/lib/stripe/webhooks";
import type Stripe from "stripe";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json(
      { error: "Missing stripe-signature header" },
      { status: 400 },
    );
  }

  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
    console.error(
      "[webhooks/stripe] STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET is not configured",
    );
    return NextResponse.json(
      { error: "Stripe isn't configured on this deployment." },
      { status: 503 },
    );
  }

  const stripe = getStripeServer();
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`Webhook signature verification failed: ${message}`);
    return NextResponse.json(
      { error: `Webhook Error: ${message}` },
      { status: 400 },
    );
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(
          event.data.object as Stripe.Checkout.Session,
        );
        break;
      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        const subscription = invoice.parent?.subscription_details?.subscription;
        if (invoice.amount_paid > 0 && subscription) {
          const subscriptionId = typeof subscription === "string" ? subscription : subscription.id;
          const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
          if (customerId) await captureServerEvent("subscription_activated", customerId, subscriptionId);
        }
        break;
      }
      case "customer.subscription.updated":
        await handleSubscriptionUpdated(
          event.data.object as Stripe.Subscription,
        );
        {
          const subscription = event.data.object as Stripe.Subscription;
          if (subscription.cancel_at_period_end || subscription.cancel_at) {
            const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
            await captureServerEvent("subscription_cancelled", customerId, subscription.id);
          }
        }
        break;
      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(
          event.data.object as Stripe.Subscription,
        );
        {
          const subscription = event.data.object as Stripe.Subscription;
          const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
          await captureServerEvent("subscription_cancelled", customerId, subscription.id);
        }
        break;
      default:
        console.log(`Unhandled event type: ${event.type}`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`Error processing webhook event: ${message}`);
    return NextResponse.json(
      { error: "Webhook handler failed" },
      { status: 500 },
    );
  }

  return NextResponse.json({ received: true });
}
