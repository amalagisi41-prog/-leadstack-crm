import { afterEach, expect, it, vi } from "vitest";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  delete (window as Window & { posthog?: unknown }).posthog;
});
it("queues signup_started once when pointer and focus handlers run for one form action", async () => {
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "test-key");
  vi.stubEnv("NEXT_PUBLIC_GA4_MEASUREMENT_ID", "G-TEST");
  const { captureClientEvent, initializeAnalytics } = await import("./client");
  initializeAnalytics();
  initializeAnalytics();
  captureClientEvent("signup_started", "same-form-action");
  captureClientEvent("signup_started", "same-form-action");
  const target = window as Window & {
    posthog?: unknown[][];
    dataLayer?: IArguments[];
  };
  expect(target.posthog).toEqual(
    expect.arrayContaining([["capture", "signup_started", {}]])
  );
  expect(target.posthog).toHaveLength(1);
  expect(
    target.dataLayer?.filter(
      (entry) => entry[0] === "event" && entry[1] === "signup_started"
    )
  ).toHaveLength(1);
  expect(
    document.querySelectorAll('script[src$="/static/array.js"]')
  ).toHaveLength(1);
});
