import { processStripeWebhook } from "@/lib/stripe/webhook-processing";
import { NextResponse } from "next/server";
import { getStripeServer } from "@/lib/stripe/server";
import type Stripe from "stripe";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json(
      { error: "Missing stripe-signature header" },
      { status: 400 }
    );
  }

  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
    console.error(
      "[webhooks/stripe] STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET is not configured"
    );
    return NextResponse.json(
      { error: "Stripe isn't configured on this deployment." },
      { status: 503 }
    );
  }

  const stripe = getStripeServer();
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`Webhook signature verification failed: ${message}`);
    return NextResponse.json(
      { error: `Webhook Error: ${message}` },
      { status: 400 }
    );
  }

  try {
    const result = await processStripeWebhook(event);
    return NextResponse.json({ received: true, duplicate: result.duplicate });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`Error processing webhook event: ${message}`);
    return NextResponse.json(
      { error: "Webhook handler failed", eventId: event.id },
      { status: 500 }
    );
  }
}
