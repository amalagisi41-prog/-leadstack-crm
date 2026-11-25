import { beforeEach, describe, expect, it, vi } from "vitest";

/* ---------- a tiny in-memory Firestore ---------- */
const UNION = Symbol("arrayUnion");
const SERVER_TS = { __ts: true };
type Doc = Record<string, unknown>;
const store = new Map<string, Doc>();

function applyWrite(prev: Doc | undefined, data: Doc, merge: boolean): Doc {
  const next: Doc = merge && prev ? { ...prev } : {};
  for (const [k, v] of Object.entries(data)) {
    const u = v as { [UNION]?: unknown[] };
    if (v && typeof v === "object" && UNION in u) {
      next[k] = [...((next[k] as unknown[]) ?? []), ...(u[UNION] ?? [])];
    } else next[k] = v;
  }
  return next;
}
function docRef(path: string) {
  return {
    id: path.split("/").pop()!,
    get: async () => ({ exists: store.has(path), id: path.split("/").pop()!, data: () => store.get(path) }),
    set: async (data: Doc, opts?: { merge?: boolean }) => void store.set(path, applyWrite(store.get(path), data, !!opts?.merge)),
    create: async (data: Doc) => {
      if (store.has(path)) throw new Error("ALREADY_EXISTS");
      store.set(path, applyWrite(undefined, data, false));
    },
    collection: (name: string) => collectionRef(`${path}/${name}`),
  };
}
let autoId = 0;
function collectionRef(path: string) {
  return {
    doc: (id?: string) => docRef(`${path}/${id ?? `auto${++autoId}`}`),
    add: async (data: Doc) => {
      const ref = docRef(`${path}/auto${++autoId}`);
      await ref.set(data);
      return ref;
    },
  };
}
const db = { doc: (p: string) => docRef(p), collection: (p: string) => collectionRef(p) };

vi.mock("firebase-admin/firestore", () => ({
  FieldValue: {
    serverTimestamp: () => SERVER_TS,
    arrayUnion: (...items: unknown[]) => ({ [UNION]: items }),
  },
  Timestamp: { now: () => new Date(), fromDate: (d: Date) => d },
}));
vi.mock("@/lib/firebase/admin", () => ({ getAdminDb: () => db }));

const publish = vi.fn();
vi.mock("@/lib/automations/qstash", () => ({ publishCallback: (...a: unknown[]) => publish(...a) }));

const sendSms = vi.fn();
let sharedSms = true;
vi.mock("@/lib/comms/twilio", () => ({
  sendSmsForSubAccount: (...a: unknown[]) => sendSms(...a),
  sendWhatsappForSubAccount: vi.fn(),
  sendWhatsappTemplateForSubAccount: vi.fn(),
  smsIsConfigured: () => sharedSms,
  subAccountTwilioIsConfigured: () => false,
  subAccountWhatsappIsConfigured: () => false,
}));
vi.mock("@/lib/server/conversations-service", () => ({ upsertConversationForMessage: vi.fn() }));

import { enqueueDealWonReviewRequest, maybeSendReviewRequest, runQueuedReviewRequest } from "./log";

function seed(cfg: Doc | null) {
  store.clear();
  store.set("subAccounts/sa1", { name: "Harbor Realty", agencyId: "ag1", googleReviewConfig: cfg });
  store.set("contacts/c1", { name: "Pat Lee", phone: "+15550100009", subAccountId: "sa1" });
  store.set("deals/d1", { title: "12 Elm St", stageId: "won", contactId: "c1", subAccountId: "sa1", agencyId: "ag1" });
}
const LINK = { reviewUrl: "https://g.page/r/x/review", channel: "sms", messageTemplate: "", cooldownDays: 0 };
const req = () => store.get("reviewRequests/deal_d1") as Doc & { events: { message: string }[] };

beforeEach(() => {
  publish.mockReset().mockResolvedValue({ messageId: "m1" });
  sendSms.mockReset().mockResolvedValue({ sid: "SM1", from: "+15550000000", mode: "shared" });
  sharedSms = true;
});

describe("post-closing review automation", () => {
  it("defaults to Log only: creates, queues with the delay, then logs 'would send' without sending", async () => {
    seed({ ...LINK }); // no automationMode stored → Log only
    expect(await enqueueDealWonReviewRequest("d1")).toEqual({ created: true, status: "queued" });
    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({ delaySeconds: 3 * 86400, body: { requestId: "deal_d1" } }),
    );
    expect(req().mode).toBe("log_only");
    expect(req().events.map((e) => e.message).join(" ")).toMatch(/would send at/);

    await runQueuedReviewRequest("deal_d1");
    expect(sendSms).not.toHaveBeenCalled();
    expect(req().status).toBe("would_send");
    expect(req().events.at(-1)!.message).toMatch(/not sent because the automation is in log-only mode/);
  });

  it("Log only still records the precise failure (no silent failures)", async () => {
    seed(null); // no review link at all
    await enqueueDealWonReviewRequest("d1");
    await runQueuedReviewRequest("deal_d1");
    expect(req().status).toBe("failed");
    expect(req().reason).toBe("not_configured");
    expect(req().events.at(-1)!.message).toMatch(/Would fail — the Google review link isn't set up/);
    expect(sendSms).not.toHaveBeenCalled();
  });

  it("Live sends at the delayed time and logs it", async () => {
    seed({ ...LINK, automationMode: "live", delayDaysAfterClosing: 0 });
    await enqueueDealWonReviewRequest("d1");
    expect(publish).toHaveBeenCalledWith(expect.objectContaining({ delaySeconds: 0 }));
    await runQueuedReviewRequest("deal_d1");
    expect(sendSms).toHaveBeenCalledTimes(1);
    expect(req().status).toBe("sent");
  });

  it("Live logs a send failure with its reason", async () => {
    seed({ ...LINK, automationMode: "live" });
    sharedSms = false;
    await enqueueDealWonReviewRequest("d1");
    await runQueuedReviewRequest("deal_d1");
    expect(req().status).toBe("failed");
    expect(req().events.at(-1)!.message).toBe("Failed — text messaging isn't configured for this workspace.");
  });

  it("Off creates nothing; switching Off before the send time cancels", async () => {
    seed({ ...LINK, automationMode: "off" });
    expect(await enqueueDealWonReviewRequest("d1")).toMatchObject({ created: false });
    expect(store.has("reviewRequests/deal_d1")).toBe(false);

    seed({ ...LINK, automationMode: "live" });
    await enqueueDealWonReviewRequest("d1");
    (store.get("subAccounts/sa1")!.googleReviewConfig as Doc).automationMode = "off";
    await runQueuedReviewRequest("deal_d1");
    expect(req().status).toBe("cancelled");
    expect(sendSms).not.toHaveBeenCalled();
  });

  it("is idempotent per deal and logs a scheduling failure", async () => {
    seed({ ...LINK });
    publish.mockResolvedValue(null);
    expect(await enqueueDealWonReviewRequest("d1")).toMatchObject({ status: "failed", reason: "scheduling_unavailable" });
    expect(await enqueueDealWonReviewRequest("d1")).toMatchObject({ created: false, reason: "already_exists" });
  });
});

describe("manual send", () => {
  it("is exempt from delay and mode, and is logged", async () => {
    seed({ ...LINK }); // Log only must not affect a human's explicit send
    const r = await maybeSendReviewRequest({ subAccountId: "sa1", agencyId: "ag1", contactId: "c1", trigger: "manual" });
    expect(r.sent).toBe(true);
    expect(publish).not.toHaveBeenCalled();
    expect(store.get(`reviewRequests/${r.requestId}`)).toMatchObject({ status: "sent", mode: "manual" });
  });

  it("returns and logs a clear failure when the channel isn't configured", async () => {
    seed({ ...LINK });
    sharedSms = false;
    const r = await maybeSendReviewRequest({ subAccountId: "sa1", agencyId: "ag1", contactId: "c1", trigger: "manual" });
    expect(r).toMatchObject({ sent: false, reason: "sms_not_configured" });
    expect(sendSms).not.toHaveBeenCalled();
    expect(store.get(`reviewRequests/${r.requestId}`)).toMatchObject({ status: "failed", reason: "sms_not_configured" });
  });
});
