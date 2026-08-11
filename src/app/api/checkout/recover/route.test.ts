import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getUser,
  listSessions,
  retrieveSubscription,
  handleCheckoutCompleted,
} = vi.hoisted(() => ({
  getUser: vi.fn(),
  listSessions: vi.fn(),
  retrieveSubscription: vi.fn(),
  handleCheckoutCompleted: vi.fn(),
}));

vi.mock("@/lib/firebase/admin", () => ({
  getAdminAuth: () => ({ getUser }),
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
    customClaims: { agencyId: "agency-1", agencyRole: "owner" },
  });
  listSessions.mockResolvedValue({ data: [] });
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
});
