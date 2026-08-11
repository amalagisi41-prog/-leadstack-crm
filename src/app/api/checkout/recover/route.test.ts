import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getUser,
  listSessions,
  retrieveSubscription,
  handleCheckoutCompleted,
  purchaseGet,
  purchaseSet,
} = vi.hoisted(() => ({
  getUser: vi.fn(),
  listSessions: vi.fn(),
  retrieveSubscription: vi.fn(),
  handleCheckoutCompleted: vi.fn(),
  purchaseGet: vi.fn(),
  purchaseSet: vi.fn(),
}));

vi.mock("@/lib/firebase/admin", () => ({
  getAdminAuth: () => ({ getUser }),
  getAdminDb: () => ({
    doc: () => ({ get: purchaseGet, set: purchaseSet }),
  }),
}));
vi.mock("@/lib/stripe/server", () => ({
  getStripeServer: () => ({
    checkout: { sessions: { list: listSessions } },
    subscriptions: { retrieve: retrieveSubscription },
  }),
}));
vi.mock("@/lib/stripe/webhooks", () => ({ handleCheckoutCompleted }));

import { POST } from "./route";

function request(uid?: string) {
  return new Request("http://localhost/api/checkout/recover", {
    method: "POST",
    headers: uid ? { "x-user-uid": uid } : {},
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  getUser.mockResolvedValue({
    uid: "user-1",
    email: "member@example.com",
    emailVerified: true,
    customClaims: { agencyId: "agency-1", agencyRole: "owner" },
  });
  listSessions.mockResolvedValue({ data: [] });
  purchaseGet.mockResolvedValue({ data: () => undefined });
  purchaseSet.mockResolvedValue(undefined);
});

describe("POST /api/checkout/recover", () => {
  it("requires an authenticated user", async () => {
    const response = await POST(request());
    expect(response.status).toBe(401);
  });

  it("does not recover another user's paid checkout", async () => {
    listSessions.mockResolvedValue({
      data: [{
        id: "cs_paid_other",
        status: "complete",
        payment_status: "paid",
        subscription: "sub_1",
        metadata: {
          mode: "existing_agency",
          uid: "user-2",
          agencyId: "agency-2",
        },
      }],
    });

    const response = await POST(request("user-1"));
    expect(await response.json()).toEqual({ recovered: false });
    expect(handleCheckoutCompleted).not.toHaveBeenCalled();
  });

  it("does not unlock a canceled subscription", async () => {
    const session = {
      id: "cs_canceled",
      status: "complete",
      payment_status: "paid",
      subscription: "sub_canceled",
      metadata: {
        mode: "existing_agency",
        uid: "user-1",
        agencyId: "agency-1",
      },
    };
    listSessions.mockResolvedValue({ data: [session] });
    retrieveSubscription.mockResolvedValue({ status: "canceled" });

    const response = await POST(request("user-1"));
    expect(await response.json()).toEqual({ recovered: false });
    expect(handleCheckoutCompleted).not.toHaveBeenCalled();
  });

  it("reconciles an exact paid active workspace checkout", async () => {
    const session = {
      id: "cs_paid",
      status: "complete",
      payment_status: "paid",
      subscription: "sub_active",
      metadata: {
        mode: "existing_agency",
        uid: "user-1",
        agencyId: "agency-1",
      },
    };
    listSessions.mockResolvedValue({ data: [session] });
    retrieveSubscription.mockResolvedValue({ status: "trialing" });

    const response = await POST(request("user-1"));
    expect(await response.json()).toEqual({ recovered: true });
    expect(handleCheckoutCompleted).toHaveBeenCalledWith(session);
  });

  it("links an unclaimed new-account purchase by verified Stripe email", async () => {
    const session = {
      id: "cs_new_paid",
      status: "complete",
      payment_status: "paid",
      customer: "cus_1",
      customer_details: { email: "member@example.com" },
      subscription: "sub_new_active",
      metadata: { mode: "new_agency" },
    };
    listSessions.mockResolvedValue({ data: [session] });
    retrieveSubscription.mockResolvedValue({ status: "trialing" });

    const response = await POST(request("user-1"));
    expect(await response.json()).toEqual({ recovered: true });
    expect(handleCheckoutCompleted).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          mode: "existing_agency",
          uid: "user-1",
          agencyId: "agency-1",
        }),
      }),
    );
    expect(purchaseSet).toHaveBeenCalledWith(
      expect.objectContaining({
        claimed: true,
        claimedByUid: "user-1",
        recoveredIntoAgencyId: "agency-1",
      }),
      { merge: true },
    );
  });

  it("never links a new-account purchase when the login email is unverified", async () => {
    getUser.mockResolvedValue({
      uid: "user-1",
      email: "member@example.com",
      emailVerified: false,
      customClaims: { agencyId: "agency-1", agencyRole: "owner" },
    });
    listSessions.mockResolvedValue({
      data: [{
        id: "cs_new_paid",
        status: "complete",
        payment_status: "paid",
        customer_details: { email: "member@example.com" },
        subscription: "sub_1",
        metadata: { mode: "new_agency" },
      }],
    });

    const response = await POST(request("user-1"));
    expect(await response.json()).toEqual({ recovered: false });
    expect(handleCheckoutCompleted).not.toHaveBeenCalled();
  });
});
