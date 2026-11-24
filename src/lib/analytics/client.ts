"use client";
import type { FunnelEvent, FunnelProperties } from "./events";

type PostHogClient = {
  capture: (name: string, properties?: FunnelProperties) => void;
  identify: (id: string) => void;
};
type AnalyticsWindow = Window & {
  posthog?: PostHogClient;
  dataLayer?: unknown[];
};
let initialized = false;
const actions = new Set<string>();

// CDN SDK bootstrap: queue the initialization and early calls until array.js
// replaces this queue with the full PostHog client. No client data is captured
// automatically, and replay is disabled on CRM screens.
export function initializeAnalytics() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  const target = window as AnalyticsWindow;
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key || target.posthog) return;
  const host =
    process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com";
  const queue = Object.assign([] as unknown[][], {
    _i: [
      [
        key,
        {
          api_host: host,
          autocapture: false,
          capture_pageview: false,
          capture_pageleave: false,
          disable_session_recording: true,
          person_profiles: "identified_only",
        },
        "posthog",
      ],
    ],
    __SV: 1,
    people: [],
    capture: (name: string, properties?: FunnelProperties) => {
      queue.push(["capture", name, properties]);
    },
    identify: (id: string) => {
      queue.push(["identify", id]);
    },
  });
  target.posthog = queue;
  const script = document.createElement("script");
  script.async = true;
  script.crossOrigin = "anonymous";
  script.src = `${host.replace(".i.posthog.com", "-assets.i.posthog.com")}/static/array.js`;
  document.head.appendChild(script);
}

function gtag(...args: unknown[]) {
  const target = window as AnalyticsWindow;
  target.dataLayer ??= [];
  // gtag uses Arguments objects rather than arrays.
  void args;
  // eslint-disable-next-line prefer-rest-params -- gtag requires its standard Arguments queue.
  target.dataLayer.push(arguments);
}

export function identifyAnalytics(id: string) {
  initializeAnalytics();
  (window as AnalyticsWindow).posthog?.identify(id);
  if (process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID) {
    gtag("config", process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID, {
      user_id: id,
      send_page_view: false,
    });
  }
}

export function captureClientEvent(
  event: FunnelEvent,
  actionId: string,
  properties: FunnelProperties = {}
) {
  if (typeof window === "undefined") return;
  initializeAnalytics();
  const key = `${event}:${actionId}`;
  if (actions.has(key)) return;
  actions.add(key);
  (window as AnalyticsWindow).posthog?.capture(event, properties);
  if (process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID) {
    gtag("event", event, {
      ...properties,
      send_to: process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID,
    });
  }
}
