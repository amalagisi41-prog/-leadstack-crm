import { afterEach, beforeEach, expect, it, vi } from "vitest";

// Transactional Firestore double: writes are staged and committed together;
// failures roll back the entire transaction, and concurrent transactions serialize.
const state = vi.hoisted(() => {
  const rows = new Map<string, Record<string, unknown>>();
  const control = {
    failActivation: false,
    failLedger: false,
    activationWrites: 0,
  };
  let tail = Promise.resolve();
  type Write = {
    path: string;
    data: Record<string, unknown>;
    create?: boolean;
  };
  const apply = (write: Write) => {
    if (write.create && rows.has(write.path))
      throw Object.assign(new Error("exists"), { code: 6 });
    const old = rows.get(write.path) ?? {};
    if (
      write.path.startsWith("agencies/") &&
      old.subscriptionStatus !== "active" &&
      write.data.subscriptionStatus === "active"
    )
      control.activationWrites++;
    const value = { ...old };
    for (const [key, item] of Object.entries(write.data)) {
      if (key.startsWith("deliveries."))
        value.deliveries = {
          ...((value.deliveries as object) ?? {}),
          [key.slice(11)]: item,
        };
      else value[key] = item;
    }
    rows.set(write.path, value);
  };
  const ref = (path: string) => ({
    path,
    id: path.split("/").at(-1),
    get: async () => snapshot(path),
    create: async (data: Record<string, unknown>) =>
      apply({ path, data, create: true }),
    update: async (data: Record<string, unknown>) => {
      if (
        control.failLedger &&
        path.startsWith("processedWebhookEvents/") &&
        data.status === "processed"
      ) {
        control.failLedger = false;
        throw new Error("simulated final ledger write failure");
      }
      apply({ path, data });
    },
  });
  const snapshot = (path: string) => ({
    ref: ref(path),
    id: path.split("/").at(-1),
    exists: rows.has(path),
    data: () => (rows.has(path) ? structuredClone(rows.get(path)) : undefined),
  });
  const db = {
    doc: ref,
    collection: (name: string) => ({
      where: (key: string, _op: string, value: string) => ({
        collection: name,
        key,
        value,
      }),
    }),
    runTransaction: async <T>(
      callback: (transaction: object) => Promise<T>
    ) => {
      const previous = tail;
      let release!: () => void;
      tail = new Promise<void>((resolve) => {
        release = resolve;
      });
      await previous;
      const writes: Write[] = [];
      try {
        const result = await callback({
          get: async (target: {
            path?: string;
            collection?: string;
            key?: string;
            value?: string;
          }) => {
            if (writes.length) throw new Error("transaction read after write");
            if (target.path) return snapshot(target.path);
            return {
              docs: [...rows.keys()]
                .filter(
                  (path) =>
                    path.startsWith(`${target.collection}/`) &&
                    rows.get(path)?.[target.key!] === target.value
                )
                .map(snapshot),
            };
          },
          set: (target: { path: string }, data: Record<string, unknown>) => {
            writes.push({ path: target.path, data });
          },
          create: (target: { path: string }, data: Record<string, unknown>) => {
            writes.push({ path: target.path, data, create: true });
          },
        });
        if (
          control.failActivation &&
          writes.some(
            (write) =>
              write.path.startsWith("agencies/") &&
              write.data.subscriptionStatus === "active"
          )
        ) {
          control.failActivation = false;
          throw new Error("simulated activation failure");
        }
        for (const write of writes)
          if (write.create && rows.has(write.path))
            throw Object.assign(new Error("exists"), { code: 6 });
        if (
          control.failLedger &&
          writes.some(
            (write) =>
              write.path.startsWith("processedWebhookEvents/") &&
              write.data.status === "processed"
          )
        ) {
          control.failLedger = false;
          throw new Error("simulated final ledger write failure");
        }
        writes.forEach(apply);
        return result;
      } finally {
        release();
      }
    },
  };
  return {
    rows,
    control,
    db,
    constructEvent: vi.fn(),
    checkout: vi.fn(),
    updated: vi.fn(),
    deleted: vi.fn(),
  };
});
vi.mock("@/lib/firebase/admin", () => ({ getAdminDb: () => state.db }));
vi.mock("firebase-admin/firestore", () => ({
  FieldValue: { serverTimestamp: () => "server-timestamp" },
}));
vi.mock("@/lib/stripe/server", () => ({
  getStripeServer: () => ({
    webhooks: { constructEvent: state.constructEvent },
  }),
}));
vi.mock("@/lib/stripe/webhooks", () => ({
  handleCheckoutCompleted: state.checkout,
  handleSubscriptionUpdated: state.updated,
  handleSubscriptionDeleted: state.deleted,
}));
import { POST } from "./route";
import { deliverWebhookAnalytics } from "@/lib/analytics/webhook";

const request = () =>
  new Request("https://example.test/api/webhooks/stripe", {
    method: "POST",
    headers: { "stripe-signature": "test-signature" },
    body: "signed-body",
  });
const invoice = (id = "evt_first", invoiceId = "in_first") => ({
  id,
  type: "invoice.paid",
  livemode: false,
  data: {
    object: {
      id: invoiceId,
      paid: true,
      status: "paid",
      customer: "cus_1",
      amount_paid: 9900,
      parent: { subscription_details: { subscription: "sub_1" } },
      metadata: {},
    },
  },
});
beforeEach(() => {
  vi.clearAllMocks();
  state.rows.clear();
  Object.assign(state.control, {
    failActivation: false,
    failLedger: false,
    activationWrites: 0,
  });
  state.rows.set("agencies/workspace", {
    stripeCustomerId: "cus_1",
    subscriptionId: "sub_1",
    subscriptionStatus: "inactive",
  });
  vi.stubEnv("STRIPE_SECRET_KEY", "test");
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", "test");
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "project-test");
  vi.stubEnv("NEXT_PUBLIC_GA4_MEASUREMENT_ID", "");
  vi.stubEnv("GA4_API_SECRET", "");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200 }));
  state.constructEvent.mockReturnValue(invoice());
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("activates once and sends one event for sequential and concurrent duplicate deliveries", async () => {
  const responses = await Promise.all([POST(request()), POST(request())]);
  // A concurrent delivery may retry (500) while the lease is held.
  expect(responses.some((response) => response.status === 200)).toBe(true);
  expect((await POST(request())).status).toBe(200);
  expect(state.control.activationWrites).toBe(1);
  expect(fetch).toHaveBeenCalledOnce();
  expect(state.rows.get("processedWebhookEvents/evt_first")).toMatchObject({
    eventId: "evt_first",
    type: "invoice.paid",
    receivedAt: "server-timestamp",
    status: "processed",
    processingResult: "activated",
    workspacePaths: ["agencies/workspace"],
  });
  const payload = JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body));
  expect(payload).toMatchObject({
    event: "subscription_activated",
    properties: {
      $insert_id: "evt_first",
      invoice_id: "in_first",
      customer_id: "cus_1",
      is_test: true,
    },
  });
  expect(await (await POST(request())).json()).toMatchObject({
    duplicate: true,
  });
});
it("ledgers a new renewal without another activation or analytics event", async () => {
  await POST(request());
  const active = structuredClone(state.rows.get("agencies/workspace"));
  state.constructEvent.mockReturnValue(invoice("evt_renewal", "in_renewal"));
  expect((await POST(request())).status).toBe(200);
  expect(state.control.activationWrites).toBe(1);
  expect(fetch).toHaveBeenCalledOnce();
  expect(state.rows.get("agencies/workspace")).toEqual(active);
  expect(state.rows.get("processedWebhookEvents/evt_renewal")).toMatchObject({
    status: "processed",
    processingResult: "already_active",
  });
});
it("keeps activation and a replayable pending record when analytics fails, with a visible error", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  vi.mocked(fetch).mockResolvedValue({ ok: false, status: 503 } as Response);
  expect((await POST(request())).status).toBe(200);
  expect(state.rows.get("agencies/workspace")?.subscriptionStatus).toBe(
    "active"
  );
  expect(state.rows.get("pendingAnalytics/evt_first")).toMatchObject({
    status: "pending",
    stripeEventId: "evt_first",
    event: "subscription_activated",
    payload: { invoice_id: "in_first" },
    error: "posthog returned HTTP 503",
  });
  expect(log).toHaveBeenCalledWith(
    "[stripe-webhook] analytics pending",
    expect.objectContaining({
      stripeEventId: "evt_first",
      error: "posthog returned HTTP 503",
    })
  );
  await POST(request());
  expect(fetch).toHaveBeenCalledOnce();
  vi.mocked(fetch).mockResolvedValue({ ok: true, status: 200 } as Response);
  await deliverWebhookAnalytics("evt_first");
  expect(state.rows.get("pendingAnalytics/evt_first")?.status).toBe("sent");
  expect(
    JSON.parse(String(vi.mocked(fetch).mock.calls[1][1]?.body)).properties
      .$insert_id
  ).toBe("evt_first");
});
it("returns 500 on activation failure, rolls back, and succeeds exactly once on redelivery", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  state.control.failActivation = true;
  expect((await POST(request())).status).toBe(500);
  expect(state.rows.get("agencies/workspace")?.subscriptionStatus).toBe(
    "inactive"
  );
  expect(fetch).not.toHaveBeenCalled();
  expect(state.rows.has("pendingAnalytics/evt_first")).toBe(false);
  expect((await POST(request())).status).toBe(200);
  await POST(request());
  expect(state.control.activationWrites).toBe(1);
  expect(fetch).toHaveBeenCalledOnce();
});
it("recovers a final ledger-write failure without duplicating activation or analytics", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  state.control.failLedger = true;
  expect((await POST(request())).status).toBe(500);
  expect(fetch).toHaveBeenCalledOnce();
  expect((await POST(request())).status).toBe(200);
  expect(fetch).toHaveBeenCalledOnce();
  expect(state.control.activationWrites).toBe(1);
});
it("suppresses a new activation when a subscription update or checkout already activated the workspace", async () => {
  state.rows.get("agencies/workspace")!.subscriptionStatus = "active";
  expect((await POST(request())).status).toBe(200);
  expect(fetch).not.toHaveBeenCalled();
  expect(
    state.rows.get("processedWebhookEvents/evt_first")?.processingResult
  ).toBe("already_active");
});
it("does not activate unpaid invoices or invoices without a subscription", async () => {
  const event = invoice();
  event.data.object.status = "open";
  state.constructEvent.mockReturnValue(event);
  expect((await POST(request())).status).toBe(200);
  expect(fetch).not.toHaveBeenCalled();
});
it("does not match a delayed invoice to a replacement subscription", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  state.rows.get("agencies/workspace")!.subscriptionId = "sub_replacement";
  expect((await POST(request())).status).toBe(500);
  expect(fetch).not.toHaveBeenCalled();
});
it("rejects an invalid signature before writing a ledger or sending analytics", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  state.constructEvent.mockImplementation(() => {
    throw new Error("invalid signature");
  });
  expect((await POST(request())).status).toBe(400);
  expect(fetch).not.toHaveBeenCalled();
  expect([...state.rows.keys()]).toEqual(["agencies/workspace"]);
});
it("ledgers checkout once without changing its existing handler behavior", async () => {
  state.constructEvent.mockReturnValue({
    id: "evt_checkout",
    type: "checkout.session.completed",
    livemode: false,
    data: { object: { id: "cs_1" } },
  });
  await POST(request());
  await POST(request());
  expect(state.checkout).toHaveBeenCalledOnce();
  expect(fetch).not.toHaveBeenCalled();
});
