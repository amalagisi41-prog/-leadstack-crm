import "server-only";
import { getAdminDb } from "@/lib/firebase/admin";
import type { FunnelEvent, FunnelProperties } from "./events";

export type WebhookAnalytics = {
  event: FunnelEvent;
  stripeEventId: string;
  distinctId: string;
  payload: FunnelProperties;
};

// The outbox is committed atomically with the activation. It contains no API
// secrets, and remains replayable if delivery fails after the state transition.
export async function deliverWebhookAnalytics(
  stripeEventId: string
): Promise<void> {
  const ref = getAdminDb().doc(`pendingAnalytics/${stripeEventId}`);
  const snapshot = await ref.get();
  if (!snapshot.exists || snapshot.data()?.status === "sent") return;
  const record = snapshot.data() as WebhookAnalytics & {
    deliveries?: Record<string, string>;
  };
  const destinations = [
    ...(process.env.NEXT_PUBLIC_POSTHOG_KEY ? ["posthog"] : []),
    ...(process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID && process.env.GA4_API_SECRET
      ? ["ga4"]
      : []),
  ];
  try {
    if (!destinations.length)
      throw new Error("No webhook analytics destination is configured");
    for (const destination of destinations) {
      if (record.deliveries?.[destination] === "sent") continue;
      // GA4 has no general exactly-once delivery primitive. A persisted attempt
      // prevents uncertain GA4 requests being replayed automatically. PostHog
      // can safely reconcile uncertainty using the Stripe event ID as insert ID.
      if (destination === "ga4" && record.deliveries?.ga4 === "attempting") {
        throw new Error("GA4 delivery uncertain; reconcile before replay");
      }
      await ref.update({
        [`deliveries.${destination}`]: "attempting",
        lastAttemptAt: new Date(),
      });
      const response =
        destination === "posthog"
          ? await fetch(
              `${process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com"}/capture/`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  api_key: process.env.NEXT_PUBLIC_POSTHOG_KEY,
                  event: record.event,
                  properties: {
                    ...record.payload,
                    distinct_id: record.distinctId,
                    $insert_id: stripeEventId,
                  },
                }),
                signal: AbortSignal.timeout(3000),
              }
            )
          : await fetch(
              `https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID!)}&api_secret=${encodeURIComponent(process.env.GA4_API_SECRET!)}`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  client_id: record.distinctId,
                  user_id: record.distinctId,
                  events: [
                    {
                      name: record.event,
                      params: {
                        ...record.payload,
                        stripe_event_id: stripeEventId,
                        engagement_time_msec: 1,
                      },
                    },
                  ],
                }),
                signal: AbortSignal.timeout(3000),
              }
            );
      if (!response.ok) {
        await ref.update({ [`deliveries.${destination}`]: "failed" });
        throw new Error(`${destination} returned HTTP ${response.status}`);
      }
      await ref.update({ [`deliveries.${destination}`]: "sent" });
    }
    await ref.update({ status: "sent", sentAt: new Date(), error: null });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown analytics error";
    console.error("[stripe-webhook] analytics pending", {
      stripeEventId,
      event: record.event,
      error: message,
    });
    // A failure to persist the pending state is fatal: propagate it to Stripe.
    await ref.update({
      status: "pending",
      error: message,
      failedAt: new Date(),
    });
  }
}
