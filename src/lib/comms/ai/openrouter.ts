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

export interface AiChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AiCompletionResult {
  text: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  model: string;
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
}: {
  model?: string;
  messages: AiChatMessage[];
  /** Cap on output tokens. 400 ≈ 300 words, fits within a few SMS
   *  segments. SMS replies should be short anyway. */
  maxTokens?: number;
  temperature?: number;
}): Promise<AiCompletionResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENROUTER_API_KEY is not set — AI replies require it. Get a key at openrouter.ai.",
    );
  }

  const chosenModel = model?.trim() || defaultAiModel();

  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      // OpenRouter optional but recommended — helps them attribute usage.
      "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL ?? "https://leadstack.dev",
      "X-Title": "LeadStack AI Replies",
    },
    body: JSON.stringify({
      model: chosenModel,
      messages,
      max_tokens: maxTokens,
      temperature,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `OpenRouter ${res.status}: ${body.slice(0, 300) || res.statusText}`,
    );
  }

  const data = (await res.json()) as OpenRouterResponse;
  if (data.error?.message) {
    throw new Error(`OpenRouter: ${data.error.message}`);
  }

  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) {
    throw new Error("OpenRouter returned no message content");
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
