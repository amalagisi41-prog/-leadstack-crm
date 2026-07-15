import "server-only";

/**
 * OpenAI embeddings client — agency-level integration, one key per
 * deployment (OPENAI_API_KEY), shared across every sub-account. Powers
 * the AI Agent Knowledge Base's retrieval (chunk embedding at ingest
 * time, query embedding at retrieval time) — see
 * lib/knowledge-base/retrieve.ts.
 *
 * Uses text-embedding-3-small (1536 dimensions, ~$0.02/1M tokens) — the
 * cheapest OpenAI embedding model, more than sufficient for short
 * business-knowledge chunks. This is a separate provider from
 * OPENROUTER_API_KEY (which only proxies chat completions, not
 * embeddings) — kept optional and gracefully degrading like every other
 * integration in this codebase.
 */

const OPENAI_BASE = "https://api.openai.com";
const EMBEDDING_MODEL = "text-embedding-3-small";
export const EMBEDDING_DIMENSIONS = 1536;

// OpenAI accepts an array input per request; batch to stay well under any
// practical request-size limit rather than sending one text at a time.
const BATCH_SIZE = 100;

export function embeddingsConfigured(): boolean {
  return !!process.env.OPENAI_API_KEY?.trim();
}

export class OpenAiEmbeddingsError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "OpenAiEmbeddingsError";
    this.status = status;
  }
}

async function embedBatch(texts: string[]): Promise<number[][]> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new OpenAiEmbeddingsError("OPENAI_API_KEY is not configured", 503);
  }

  const res = await fetch(`${OPENAI_BASE}/v1/embeddings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: texts }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new OpenAiEmbeddingsError(
      `OpenAI embeddings returned ${res.status}: ${text.slice(0, 200)}`,
      res.status,
    );
  }

  const json = (await res.json()) as {
    data?: { embedding: number[]; index: number }[];
    error?: { message?: string };
  };
  if (!json.data) {
    throw new OpenAiEmbeddingsError(
      `OpenAI embeddings returned no data: ${json.error?.message ?? "unknown error"}`,
      502,
    );
  }

  // The API returns results in the same order as the input, but sort by
  // `index` defensively rather than assume.
  return [...json.data]
    .sort((a, b) => a.index - b.index)
    .map((d) => d.embedding);
}

/**
 * Embeds a batch of texts, chunking the request into groups of
 * BATCH_SIZE so large sources don't hit a single oversized request.
 * Throws OpenAiEmbeddingsError on failure — callers decide how to map
 * that to a friendly status code.
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const results: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const embeddings = await embedBatch(batch);
    results.push(...embeddings);
  }
  return results;
}
