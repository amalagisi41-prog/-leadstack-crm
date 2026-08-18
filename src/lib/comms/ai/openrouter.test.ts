import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { callAi } from "./openrouter";

const completion = (model: string) =>
  new Response(
    JSON.stringify({
      model,
      choices: [{ message: { content: '{"answer":"Ready"}' } }],
      usage: { prompt_tokens: 20, completion_tokens: 5, total_tokens: 25 },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );

describe("OpenRouter credit continuity", () => {
  beforeEach(() => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("retries a credit-rejected paid model through the free router", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: { code: 402, message: "insufficient credits" },
          }),
          { status: 402 }
        )
      )
      .mockResolvedValueOnce(completion("free/model"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await callAi({
      messages: [{ role: "user", content: "Help" }],
      responseFormat: { type: "json_object" },
      maxTokens: 800,
    });

    expect(result.text).toBe('{"answer":"Ready"}');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).model).toBe(
      "anthropic/claude-haiku-4-5"
    );
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).model).toBe(
      "openai/gpt-oss-20b:free"
    );
  });

  it("allows operators to disable the free fallback", async () => {
    vi.stubEnv("AI_REPLIES_CREDIT_FALLBACK_MODEL", "off");
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ error: { code: 402, message: "no credit" } }),
          { status: 402 }
        )
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      callAi({ messages: [{ role: "user", content: "Help" }] })
    ).rejects.toMatchObject({ status: 402 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
