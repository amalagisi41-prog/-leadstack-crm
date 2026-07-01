import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the OpenRouter client so tests never hit the network or need a key.
// aiIsConfigured + callAi are controlled per-test.
vi.mock("@/lib/comms/ai/openrouter", () => ({
  aiIsConfigured: vi.fn(() => true),
  callAi: vi.fn(async () => ({
    text: "Go to dashboard Settings → SMS and paste your Twilio creds.",
    promptTokens: 10,
    completionTokens: 12,
    totalTokens: 22,
    model: "test-model",
  })),
}));

import { POST } from "./route";
import { aiIsConfigured, callAi } from "@/lib/comms/ai/openrouter";
import { ONBOARDING_HELP_KB } from "@/lib/onboarding/help-kb";

const AUTH = { "x-user-uid": "operator-1" };

function makeRequest(
  body: unknown,
  headers: Record<string, string> = AUTH,
): Request {
  return new Request("http://localhost/api/onboarding/help", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

/** Pull the system prompt out of the (mocked) callAi invocation. */
function lastSystemPrompt(): string {
  const call = vi.mocked(callAi).mock.calls.at(-1);
  const messages = call?.[0]?.messages ?? [];
  return messages.find((m) => m.role === "system")?.content ?? "";
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/onboarding/help", () => {
  it("rejects unauthenticated requests (no x-user-uid) with 401", async () => {
    const res = await POST(makeRequest({ question: "How do I import contacts?" }, {}));
    expect(res.status).toBe(401);
    expect(callAi).not.toHaveBeenCalled();
  });

  it("returns 503 (not a hallucinated answer) when OpenRouter isn't configured", async () => {
    vi.mocked(aiIsConfigured).mockReturnValueOnce(false);
    const res = await POST(makeRequest({ question: "How do I connect Twilio?" }));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toMatch(/isn't available|not configured|OpenRouter/i);
    expect(callAi).not.toHaveBeenCalled();
  });

  it("returns 400 when the question is empty", async () => {
    const res = await POST(makeRequest({ question: "   " }));
    expect(res.status).toBe(400);
    expect(callAi).not.toHaveBeenCalled();
  });

  it("returns 400 when the question exceeds the length cap", async () => {
    const res = await POST(makeRequest({ question: "a".repeat(1001) }));
    expect(res.status).toBe(400);
    expect(callAi).not.toHaveBeenCalled();
  });

  it("answers a valid question, grounded in the help KB", async () => {
    const res = await POST(
      makeRequest({ question: "How do I connect my phone number?" }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.answer).toContain("Settings → SMS");

    expect(callAi).toHaveBeenCalledTimes(1);
    const system = lastSystemPrompt();
    // The full KB must be embedded so the model can only answer from it.
    expect(system).toContain(ONBOARDING_HELP_KB);
    // And the anti-hallucination rail must be present.
    expect(system).toMatch(/only using the help content/i);

    // The user's question is the final message handed to the model.
    const messages = vi.mocked(callAi).mock.calls[0][0].messages;
    const last = messages[messages.length - 1];
    expect(last).toEqual({
      role: "user",
      content: "How do I connect my phone number?",
    });
  });

  it("injects the agency brand name into the system prompt when provided", async () => {
    await POST(
      makeRequest({
        question: "How do I turn on Speed-to-Lead?",
        brandName: "Artisan RE Solutions",
      }),
    );
    expect(lastSystemPrompt()).toContain("Artisan RE Solutions");
  });

  it("passes clean prior turns through and drops malformed ones", async () => {
    await POST(
      makeRequest({
        question: "And how do I activate the AI agent?",
        history: [
          { role: "user", content: "How do I import contacts?" },
          { role: "assistant", content: "Go to Contacts → Upload CSV." },
          { role: "system", content: "should be dropped" }, // wrong role
          { role: "user", content: "" }, // empty, dropped
          { role: "user" }, // no content, dropped
        ],
      }),
    );

    const messages = vi.mocked(callAi).mock.calls[0][0].messages;
    // system + 2 valid history turns + the new question = 4
    expect(messages).toHaveLength(4);
    expect(messages[0].role).toBe("system");
    expect(messages[1]).toEqual({
      role: "user",
      content: "How do I import contacts?",
    });
    expect(messages[2]).toEqual({
      role: "assistant",
      content: "Go to Contacts → Upload CSV.",
    });
    expect(messages[3].content).toContain("activate the AI agent");
    // No system-role turn leaked in from history.
    expect(messages.filter((m) => m.role === "system")).toHaveLength(1);
  });

  it("returns 502 (never a fabricated answer) when the LLM call throws", async () => {
    vi.mocked(callAi).mockRejectedValueOnce(new Error("upstream 500"));
    const res = await POST(makeRequest({ question: "How do quotes work?" }));
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.answer).toBeUndefined();
    expect(body.error).toBeTruthy();
  });
});
