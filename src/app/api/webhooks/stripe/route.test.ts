import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  constructEvent: vi.fn(), capture: vi.fn(), checkout: vi.fn(), updated: vi.fn(), deleted: vi.fn(),
}));
vi.mock("@/lib/stripe/server", () => ({ getStripeServer: () => ({ webhooks: { constructEvent: mocks.constructEvent } }) }));
vi.mock("@/lib/stripe/webhooks", () => ({ handleCheckoutCompleted: mocks.checkout, handleSubscriptionUpdated: mocks.updated, handleSubscriptionDeleted: mocks.deleted }));
vi.mock("@/lib/analytics/server", () => ({ captureServerEvent: mocks.capture }));
import { POST } from "./route";
const request = () => new Request("https://example.test/api/webhooks/stripe", { method: "POST", headers: { "stripe-signature": "test-signature" }, body: "signed-body" });
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("STRIPE_SECRET_KEY", "test"); vi.stubEnv("STRIPE_WEBHOOK_SECRET", "test"); });
afterEach(() => vi.unstubAllEnvs());
it("never emits activation from checkout completion alone", async () => {
  mocks.constructEvent.mockReturnValue({ type: "checkout.session.completed", data: { object: { id: "cs_1", payment_status: "unpaid" } } });
  expect((await POST(request())).status).toBe(200);
  expect(mocks.checkout).toHaveBeenCalledOnce(); expect(mocks.capture).not.toHaveBeenCalled();
});
it("emits activation only for a positive paid subscription invoice", async () => {
  mocks.constructEvent.mockReturnValue({ type: "invoice.paid", data: { object: { customer: "cus_1", amount_paid: 14900, parent: { subscription_details: { subscription: "sub_1" } } } } });
  await POST(request());
  expect(mocks.capture).toHaveBeenCalledWith("subscription_activated", "cus_1", "sub_1");
  mocks.capture.mockClear();
  mocks.constructEvent.mockReturnValue({ type: "invoice.paid", data: { object: { customer: "cus_1", amount_paid: 0, parent: { subscription_details: { subscription: "sub_1" } } } } });
  await POST(request()); expect(mocks.capture).not.toHaveBeenCalled();
});
it("uses the same cancellation action key for a scheduled cancellation and deletion", async () => {
  const subscription = { id: "sub_1", customer: "cus_1", cancel_at_period_end: true };
  for (const type of ["customer.subscription.updated", "customer.subscription.deleted"]) {
    mocks.constructEvent.mockReturnValue({ type, data: { object: subscription } }); await POST(request());
  }
  expect(mocks.capture.mock.calls).toEqual([["subscription_cancelled", "cus_1", "sub_1"], ["subscription_cancelled", "cus_1", "sub_1"]]);
});
it("rejects an invalid signature without sending any funnel event", async () => {
  mocks.constructEvent.mockImplementation(() => { throw new Error("invalid signature"); });
  expect((await POST(request())).status).toBe(400); expect(mocks.capture).not.toHaveBeenCalled();
});
