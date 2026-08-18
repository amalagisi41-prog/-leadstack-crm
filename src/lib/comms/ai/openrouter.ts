import "server-only";

/**
 * Thin OpenRouter client. OpenRouter exposes an OpenAI-compatible chat
 * completions endpoint, so we hit it directly with fetch — no SDK
 * dependency. Single key (OPENROUTER_API_KEY) covers every model; the
 * `model` parameter chooses Haiku / Sonnet / Opus / GPT / Gemini etc.
 *
 * Pricing footnote: at the v1 default of Claude Haiku 4.5, a typical
 * SMS exchange costs ~$0.005-0.02 in tokens. Opus 4.7 override (set
 * per sub-account) is ~50x more expensive — useful for premium tiers
 * but not the default.
 */

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "anthropic/claude-haiku-4-5";
const DEFAULT_CREDIT_FALLBACK_MODEL = "openrouter/free";

/**
 * Backstop so no caller can hang forever. Generous, because background
 * workers legitimately wait on long generations; interactive routes should
 * pass a much tighter `timeoutMs` of their own.
 */
const DEFAULT_TIMEOUT_MS = 60_000;

/**
 * OpenAI-style multimodal content part. Vision-capable models on OpenRouter
 * (including the Claude default) accept data-URL images via `image_url`.
 */
export type AiContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export interface AiChatMessage {
  role: "system" | "user" | "assistant";
  content: string | AiContentPart[];
}

export interface AiCompletionResult {
  text: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  model: string;
}

/**
 * A failed completion, carrying enough to tell the kinds apart.
 *
 * Callers used to receive a bare Error whose only distinguishing feature was
 * a string, so "we are out of credit", "the key is wrong" and "the model took
 * too long" were one undifferentiated failure — and each wants a different
 * response. `status` is OpenRouter's HTTP status when there was one;
 * `timedOut` marks our own abort.
 */
export class AiError extends Error {
  readonly status?: number;
  readonly timedOut: boolean;
  constructor(
    message: string,
    { status, timedOut = false }: { status?: number; timedOut?: boolean } = {}
  ) {
    super(message);
    this.name = "AiError";
    this.status = status;
    this.timedOut = timedOut;
  }
}

export function aiIsConfigured(): boolean {
  return !!process.env.OPENROUTER_API_KEY;
}

export function defaultAiModel(): string {
  return process.env.AI_REPLIES_DEFAULT_MODEL?.trim() || DEFAULT_MODEL;
}

interface OpenRouterChoice {
  message?: { content?: string };
}

interface OpenRouterUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

interface OpenRouterResponse {
  choices?: OpenRouterChoice[];
  usage?: OpenRouterUsage;
  model?: string;
  error?: { message?: string };
}

/**
 * Call OpenRouter's chat completions endpoint. Throws on non-2xx so the
 * caller can decide how to handle (typically: log + skip the AI reply,
 * never break the inbound webhook contract).
 */
export async function callAi({
  model,
  messages,
  maxTokens = 400,
  temperature = 0.5,
  responseFormat,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: {
  model?: string;
  messages: AiChatMessage[];
  /** Cap on output tokens. 400 ≈ 300 words, fits within a few SMS
   *  segments. SMS replies should be short anyway. */
  maxTokens?: number;
  temperature?: number;
  /** Ask compatible models to return a machine-readable JSON object. */
  responseFormat?: { type: "json_object" };
  /**
   * Ceiling on the round trip. Callers running inside a request the operator
   * is waiting on should pass something well under their own function limit:
   * a serverless invocation killed by the gateway returns an empty body, and
   * an empty body reaches the browser as "Unexpected end of JSON input"
   * rather than anything the operator can act on.
   */
  timeoutMs?: number;
}): Promise<AiCompletionResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENROUTER_API_KEY is not set — AI replies require it. Get a key at openrouter.ai."
    );
  }

  const chosenModel = model?.trim() || defaultAiModel();

  let res: Response;
  try {
    res = await postCompletion({
      apiKey,
      chosenModel,
      messages,
      maxTokens,
      temperature,
      responseFormat,
      timeoutMs,
    });
  } catch (error) {
    // A timeout here is indistinguishable from a network failure to callers
    // unless it is labelled, and the two want opposite responses: wait and
    // retry versus give the model longer.
    const timedOut =
      error instanceof Error &&
      (error.name === "TimeoutError" || error.name === "AbortError");
    throw new AiError(
      timedOut
        ? `OpenRouter did not respond within ${timeoutMs}ms`
        : `OpenRouter request failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
      { timedOut }
    );
  }

  // A paid model can be rejected before inference when the account's
  // remaining balance cannot cover the requested completion. Keep essential
  // product workflows available by retrying once through OpenRouter's
  // zero-cost router. OpenRouter filters that router for required features,
  // including structured JSON output. Operators can pin or disable the
  // fallback with AI_REPLIES_CREDIT_FALLBACK_MODEL (set it to "off" to
  // preserve strict paid-model-only behaviour).
  if (res.status === 402) {
    const fallbackModel = (
      process.env.AI_REPLIES_CREDIT_FALLBACK_MODEL ??
      DEFAULT_CREDIT_FALLBACK_MODEL
    ).trim();
    if (
      fallbackModel &&
      fallbackModel.toLowerCase() !== "off" &&
      fallbackModel !== chosenModel
    ) {
      res = await postCompletion({
        apiKey,
        chosenModel: fallbackModel,
        messages,
        maxTokens,
        temperature,
        responseFormat,
        timeoutMs,
      });
    }
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new AiError(
      `OpenRouter ${res.status}: ${body.slice(0, 300) || res.statusText}`,
      { status: res.status }
    );
  }

  const data = (await res.json()) as OpenRouterResponse;
  if (data.error?.message) {
    throw new AiError(`OpenRouter: ${data.error.message}`);
  }

  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) {
    throw new AiError("OpenRouter returned no message content");
  }

  const usage = data.usage ?? {};
  return {
    text,
    promptTokens: usage.prompt_tokens ?? 0,
    completionTokens: usage.completion_tokens ?? 0,
    totalTokens: usage.total_tokens ?? 0,
    model: data.model ?? chosenModel,
  };
}

/** The raw POST, split out so the caller can label a timeout distinctly. */
async function postCompletion({
  apiKey,
  chosenModel,
  messages,
  maxTokens,
  temperature,
  responseFormat,
  timeoutMs,
}: {
  apiKey: string;
  chosenModel: string;
  messages: AiChatMessage[];
  maxTokens: number;
  temperature: number;
  responseFormat?: { type: "json_object" };
  timeoutMs: number;
}): Promise<Response> {
  return fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      // OpenRouter optional but recommended — helps them attribute usage.
      "HTTP-Referer":
        process.env.NEXT_PUBLIC_APP_URL ?? "https://agentstackcrm.app",
      "X-Title": "AgentStack AI Replies",
    },
    body: JSON.stringify({
      model: chosenModel,
      messages,
      max_tokens: maxTokens,
      temperature,
      ...(responseFormat ? { response_format: responseFormat } : {}),
    }),
    // Without this the call can hang for as long as the platform allows the
    // function to live, and then be killed with no response written at all.
    signal: AbortSignal.timeout(timeoutMs),
  });
}
