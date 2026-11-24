import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type Stripe from "stripe";
const mocks = vi.hoisted(() => ({ createSession: vi.fn() }));
vi.mock("@/lib/stripe/server", () => ({ getStripeServer: () => ({ checkout: { sessions: { create: mocks.createSession } } }) }));
vi.mock("@/lib/firebase/admin", () => ({ getAdminAuth: vi.fn(), getAdminDb: vi.fn() }));
import { POST } from "./route";
beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://agentstackcrm.app");
  mocks.createSession.mockResolvedValue({ url: "https://checkout.stripe.com/test-session" });
});
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
it("charges $99 initially and at monthly renewal for new Solo checkout", async () => {
  const response = await POST(new Request("https://agentstackcrm.app/api/checkout/subscribe", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ planKey: "starter", billingInterval: "month" }),
  }));
  expect(response.status).toBe(200);
  const session = mocks.createSession.mock.calls[0][0] as Stripe.Checkout.SessionCreateParams;
  expect(session.line_items).toHaveLength(2);
  expect(session.line_items?.[0].price_data).toMatchObject({ currency: "usd", unit_amount: 9900, recurring: { interval: "month" } });
  expect(session.line_items?.[1].price_data).toMatchObject({ currency: "usd", unit_amount: 9900 });
  const submit = session.custom_text?.submit;
  expect(submit && submit.message).toContain("charged $99 today");
  expect(submit && submit.message).not.toContain("$149");
});
it("retains the existing annual billing amount", async () => {
  await POST(new Request("https://agentstackcrm.app/api/checkout/subscribe", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ planKey: "starter", billingInterval: "year" }),
  }));
  const session = mocks.createSession.mock.calls[0][0] as Stripe.Checkout.SessionCreateParams;
  expect(session.line_items?.[0].price_data).toMatchObject({ unit_amount: 118800, recurring: { interval: "year" } });
});
