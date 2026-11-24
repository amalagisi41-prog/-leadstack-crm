import "server-only";
import { createHash } from "node:crypto";
import { getAdminDb } from "@/lib/firebase/admin";
import type { FunnelEvent, FunnelProperties } from "./events";

// A durable per-destination claim prevents concurrent actions and webhook
// retries from emitting twice. Delivery is at-most-once: uncertain network
// failures are recorded for inspection, never blindly resent to GA4.
export async function captureServerEvent(
  event: FunnelEvent,
  distinctId: string,
  actionId: string,
  properties: FunnelProperties = {}
): Promise<void> {
  const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const gaId = process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID;
  const gaSecret = process.env.GA4_API_SECRET;
  const destinations = [
    ...(posthogKey ? ["posthog" as const] : []),
    ...(gaId && gaSecret ? ["ga4" as const] : []),
  ];
  await Promise.all(
    destinations.map(async (destination) => {
      const id = createHash("sha256")
        .update(`${destination}:${event}:${actionId}`)
        .digest("hex");
      const ref = getAdminDb().doc(`analyticsEvents/${id}`);
      try {
        await ref.create({
          event,
          destination,
          claimedAt: new Date(),
          status: "claimed",
        });
      } catch (error) {
        if ((error as { code?: number }).code !== 6)
          console.error("[analytics] claim failed", event);
        return;
      }
      try {
        const response =
          destination === "posthog"
            ? await fetch(
                `${process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com"}/capture/`,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    api_key: posthogKey,
                    event,
                    properties: { distinct_id: distinctId, ...properties },
                  }),
                  signal: AbortSignal.timeout(3000),
                }
              )
            : await fetch(
                `https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(gaId!)}&api_secret=${encodeURIComponent(gaSecret!)}`,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    client_id: distinctId,
                    user_id: distinctId,
                    events: [
                      {
                        name: event,
                        params: { ...properties, engagement_time_msec: 1 },
                      },
                    ],
                  }),
                  signal: AbortSignal.timeout(3000),
                }
              );
        await ref.update({
          status: response.ok ? "sent" : "failed",
          httpStatus: response.status,
        });
      } catch {
        await ref.update({ status: "uncertain" }).catch(() => undefined);
        console.error("[analytics] delivery uncertain", event, destination);
      }
    })
  ).catch(() => {
    console.error("[analytics] capture failed", event);
  });
}
