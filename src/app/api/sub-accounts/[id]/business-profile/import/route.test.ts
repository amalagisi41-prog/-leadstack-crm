import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/require-tenancy", () => ({
  requireSubAccountAdmin: vi.fn(async () => ({
    uid: "operator-1",
    agencyId: "agency-1",
  })),
}));

vi.mock("firebase-admin/firestore", () => ({
  FieldValue: { serverTimestamp: () => "SERVER_TIMESTAMP" },
}));

const setMock = vi.fn(async () => undefined);
vi.mock("@/lib/firebase/admin", () => ({
  getAdminDb: () => ({
    doc: () => ({ get: async () => ({ exists: false }), set: setMock }),
  }),
}));

vi.mock("@/lib/comms/ai/openrouter", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/comms/ai/openrouter")
  >("@/lib/comms/ai/openrouter");
  return {
    ...actual,
    aiIsConfigured: vi.fn(() => true),
    callAi: vi.fn(async () => ({
      text: '{"agentName":"Jane Doe"}',
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      model: "test",
    })),
  };
});

vi.mock("@/lib/business-profile/read-public-page", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/business-profile/read-public-page")
  >("@/lib/business-profile/read-public-page");
  return { ...actual, readPublicPage: vi.fn() };
});

import { POST } from "./route";
import { AiError, callAi } from "@/lib/comms/ai/openrouter";
import {
  PageReadError,
  readPublicPage,
} from "@/lib/business-profile/read-public-page";

/**
 * The regression: the catch here replaced every diagnosed failure with
 * "Could not read that website." — so the reader could work out exactly what
 * was wrong and the operator would still be told nothing, on the first screen
 * of the product.
 */

const ctx = { params: Promise.resolve({ id: "sub-1" }) };

function makeRequest(body: unknown): Request {
  return new Request(
    "http://localhost/api/sub-accounts/sub-1/business-profile/import",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(callAi).mockResolvedValue({
    text: "agentName=Jane Doe",
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    model: "test",
  });
});

describe("POST business-profile/import", () => {
  it("passes the diagnosed reason and next step straight through", async () => {
    vi.mocked(readPublicPage).mockRejectedValueOnce(
      new PageReadError(
        "Homes.com blocks automated reading, so we could not pull your details from that page. Paste your brokerage or personal website instead — an About or agent-bio page works best — or fill your Blueprint in by hand — every field here is editable.",
        "blocked"
      )
    );

    const res = await POST(
      makeRequest({ url: "https://www.homes.com/real-estate-agents/jane/x/" }),
      ctx
    );
    const body = await res.json();

    expect(res.status).toBe(502);
    expect(body.error).toMatch(/Homes\.com blocks automated reading/);
    expect(body.error).toMatch(/fill your Blueprint in by hand/);
    expect(body.error).not.toBe("Could not read that website.");
  });

  it("still says what to do when something unexpected breaks", async () => {
    vi.mocked(readPublicPage).mockRejectedValueOnce(new Error("boom"));

    const res = await POST(
      makeRequest({ url: "https://janedoerealty.com/about" }),
      ctx
    );
    const body = await res.json();

    expect(res.status).toBe(502);
    expect(body.error).toMatch(/fill your Blueprint in by hand/);
    // And never leaks the internal message.
    expect(body.error).not.toMatch(/boom/);
  });

  it("answers in JSON when the extraction model fails", async () => {
    // callAi was unguarded, so an OpenRouter outage became an uncaught throw,
    // which Next.js turns into a 500 with an empty body — and an empty body
    // reaches the browser as "Unexpected end of JSON input".
    vi.mocked(readPublicPage).mockResolvedValueOnce("Jane Doe, REALTOR.");
    vi.mocked(callAi).mockRejectedValueOnce(
      new AiError("OpenRouter 429: slow down", { status: 429 })
    );

    const res = await POST(
      makeRequest({ url: "https://janedoerealty.com/about" }),
      ctx
    );
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.error).toMatch(/we read your page/i);
    expect(body.error).toMatch(/by hand/i);
    expect(body.code).toBe("AI-BUSY");
    // Their page was fine — do not blame their link for our outage.
    expect(body.error).not.toMatch(/could not read|blocks automated/i);
    expect(body.error).not.toMatch(/openrouter|429/i);
  });

  it("parses the low-overhead line protocol and ignores unapproved keys", async () => {
    vi.mocked(readPublicPage).mockResolvedValueOnce("Jane Doe, REALTOR.");
    vi.mocked(callAi).mockResolvedValueOnce({
      text: [
        "agentName=Jane Doe",
        "brokerage=Example Realty",
        "services=buyers,sellers,not_a_real_service",
        "commentary=this must be ignored",
      ].join("\n"),
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      model: "free/test",
    });

    const res = await POST(
      makeRequest({ url: "https://janedoerealty.com/about" }),
      ctx
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.profile.agentName).toBe("Jane Doe");
    expect(body.profile.brokerage).toBe("Example Realty");
    expect(body.profile.services).toEqual(["buyers", "sellers"]);
    expect(body.profile.commentary).toBeUndefined();
    expect(callAi).toHaveBeenCalledTimes(1);
    expect(vi.mocked(callAi).mock.calls[0][0].responseFormat).toBeUndefined();
  });

  it("answers in JSON when line-based output is invalid", async () => {
    vi.mocked(readPublicPage).mockResolvedValueOnce("Jane Doe, REALTOR.");
    vi.mocked(callAi).mockResolvedValue({
      text: "I'm afraid I can't.",
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      model: "test",
    });

    const res = await POST(
      makeRequest({ url: "https://janedoerealty.com/about" }),
      ctx
    );
    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatch(/another public website/i);
    expect(callAi).toHaveBeenCalledTimes(1);
  });

  it("answers in JSON when something unexpected throws", async () => {
    // The outer guard. Without it Next.js writes no body at all.
    vi.mocked(readPublicPage).mockResolvedValueOnce("Jane Doe, REALTOR.");
    setMock.mockRejectedValueOnce(new Error("Firestore unavailable"));

    const res = await POST(
      makeRequest({ url: "https://janedoerealty.com/about" }),
      ctx
    );
    const text = await res.text();

    expect(res.status).toBe(500);
    expect(text.length).toBeGreaterThan(0); // never an empty body
    expect(JSON.parse(text).error).toMatch(/Nothing was changed/i);
  });

  it("gives the model the time the read did not spend", async () => {
    // A flat 20s cap on a call that previously had no timeout is what broke
    // AI-assisted setup: a full Blueprint regularly takes longer than that.
    // The budget now adapts, and must stay inside maxDuration (60s).
    vi.mocked(readPublicPage).mockResolvedValueOnce("Jane Doe, REALTOR.");
    await POST(makeRequest({ url: "https://janedoerealty.com/about" }), ctx);

    const [args] = vi.mocked(callAi).mock.calls.at(-1)!;
    expect(args.timeoutMs).toBeGreaterThan(30_000);
    expect(args.timeoutMs).toBeLessThan(55_000);
  });

  it("still leaves the model a workable floor after a slow read", async () => {
    vi.mocked(readPublicPage).mockImplementationOnce(async () => {
      await new Promise((resolve) => setTimeout(resolve, 60));
      return "Jane Doe, REALTOR.";
    });
    await POST(makeRequest({ url: "https://janedoerealty.com/about" }), ctx);

    const [args] = vi.mocked(callAi).mock.calls.at(-1)!;
    expect(args.timeoutMs).toBeGreaterThanOrEqual(15_000);
  });

  it("names the fault instead of calling everything 'not responding'", async () => {
    vi.mocked(readPublicPage).mockResolvedValueOnce("Jane Doe, REALTOR.");
    vi.mocked(callAi).mockRejectedValueOnce(
      new AiError("did not respond in time", { timedOut: true })
    );

    const res = await POST(
      makeRequest({ url: "https://janedoerealty.com/about" }),
      ctx
    );
    const body = await res.json();

    expect(body.code).toBe("AI-TIMEOUT");
    expect(body.error).toMatch(/took longer than we allow/i);
  });

  it("does not tell them to retry a misconfiguration", async () => {
    // A wrong key or a spent balance will not fix itself on the third attempt.
    vi.mocked(readPublicPage).mockResolvedValueOnce("Jane Doe, REALTOR.");
    vi.mocked(callAi).mockRejectedValueOnce(
      new AiError("nope", { status: 401 })
    );

    const res = await POST(
      makeRequest({ url: "https://janedoerealty.com/about" }),
      ctx
    );
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.code).toBe("AI-AUTH");
    expect(body.error).not.toMatch(/try again/i);
    expect(body.error).toMatch(/by hand/i);
  });

  it("rejects a private address before any request goes out", async () => {
    const res = await POST(
      makeRequest({ url: "http://169.254.169.254/latest/meta-data/" }),
      ctx
    );
    expect(res.status).toBe(400);
    expect(readPublicPage).not.toHaveBeenCalled();
  });

  it("saves the draft when the page reads cleanly", async () => {
    vi.mocked(readPublicPage).mockResolvedValueOnce(
      "Jane Doe is a REALTOR in Fairfield County."
    );

    const res = await POST(
      makeRequest({ url: "https://janedoerealty.com/about" }),
      ctx
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.profile.agentName).toBe("Jane Doe");
    expect(body.needsReview).toBe(true);
    expect(setMock).toHaveBeenCalled();
  });
});
