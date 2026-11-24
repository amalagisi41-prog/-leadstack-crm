import { beforeEach, afterEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  claims: new Set<string>(),
  updates: [] as unknown[],
}));
vi.mock("@/lib/firebase/admin", () => ({
  getAdminDb: () => ({
    doc: (id: string) => ({
      create: async () => {
        if (state.claims.has(id)) throw { code: 6 };
        state.claims.add(id);
      },
      update: async (value: unknown) => {
        state.updates.push(value);
      },
    }),
  }),
}));
import { captureServerEvent } from "./server";
beforeEach(() => {
  state.claims.clear();
  state.updates = [];
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "test-key");
  vi.stubEnv("NEXT_PUBLIC_GA4_MEASUREMENT_ID", "G-TEST");
  vi.stubEnv("GA4_API_SECRET", "test-secret");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 204 }));
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
it("emits each action once per provider despite concurrent calls and webhook retries", async () => {
  await Promise.all(
    Array.from({ length: 5 }, () =>
      captureServerEvent("subscription_activated", "user-id", "sub-id")
    )
  );
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(state.updates).toEqual([
    { status: "sent", httpStatus: 204 },
    { status: "sent", httpStatus: 204 },
  ]);
});
it("records uncertainty without re-sending a possibly accepted GA4 action", async () => {
  vi.mocked(fetch).mockRejectedValue(new Error("timeout"));
  await captureServerEvent("setup_step_completed", "workspace", "workspace:2", {
    step: 2,
  });
  await captureServerEvent("setup_step_completed", "workspace", "workspace:2", {
    step: 2,
  });
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(state.updates).toEqual([
    { status: "uncertain" },
    { status: "uncertain" },
  ]);
});
it("does no network or database work when analytics is unconfigured", async () => {
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "");
  vi.stubEnv("GA4_API_SECRET", "");
  await captureServerEvent("signup_completed", "uid", "uid");
  expect(fetch).not.toHaveBeenCalled();
  expect(state.claims.size).toBe(0);
});
it("sends step 1–6 properties and keeps the GA4 secret out of PostHog", async () => {
  await captureServerEvent("setup_step_completed", "workspace", "workspace:6", {
    step: 6,
  });
  const calls = vi.mocked(fetch).mock.calls;
  const posthog = calls.find(([url]) => String(url).includes("/capture/"))!;
  const ga = calls.find(([url]) => String(url).includes("mp/collect"))!;
  expect(JSON.parse(String(posthog[1]?.body)).properties.step).toBe(6);
  expect(String(posthog[1]?.body)).not.toContain("test-secret");
  expect(JSON.parse(String(ga[1]?.body)).events[0]).toMatchObject({
    name: "setup_step_completed",
    params: { step: 6 },
  });
});
