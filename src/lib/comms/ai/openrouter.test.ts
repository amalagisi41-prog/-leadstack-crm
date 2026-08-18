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

  it("fails closed on a credit-rejected paid model by default", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: { code: 402, message: "insufficient credits" },
        }),
        { status: 402 }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      callAi({
        messages: [{ role: "user", content: "Help" }],
        responseFormat: { type: "json_object" },
        maxTokens: 800,
      })
    ).rejects.toMatchObject({ status: 402 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).model).toBe(
      "anthropic/claude-haiku-4.5"
    );
  });

  it("repairs the legacy invalid Haiku model id before sending", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(completion("anthropic/claude-haiku-4.5"));
    vi.stubGlobal("fetch", fetchMock);

    await callAi({
      model: "anthropic/claude-haiku-4-5",
      messages: [{ role: "user", content: "Help" }],
    });

    expect(JSON.parse(fetchMock.mock.calls[0][1].body).model).toBe(
      "anthropic/claude-haiku-4.5"
    );
  });

  it("uses an operator-approved credit fallback when explicitly configured", async () => {
    vi.stubEnv(
      "AI_REPLIES_CREDIT_FALLBACK_MODEL",
      "openai/gpt-oss-20b:free"
    );
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
      .mockResolvedValueOnce(completion("openai/gpt-oss-20b:free"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await callAi({
      messages: [{ role: "user", content: "Help" }],
      responseFormat: { type: "json_object" },
      maxTokens: 800,
    });

    expect(result.text).toBe('{"answer":"Ready"}');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).model).toBe(
      "openai/gpt-oss-20b:free"
    );
  });
});
