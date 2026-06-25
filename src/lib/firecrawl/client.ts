import "server-only";

/**
 * Firecrawl client — agency-level integration. One API key per deployment
 * (FIRECRAWL_API_KEY) is shared across every sub-account. Used today to
 * pull a single-page snapshot of a sub-account's website so the AI agent
 * can reference it when replying to inbound messages.
 *
 * v1 only uses the /scrape endpoint (single URL → markdown). The /crawl
 * endpoint (multi-page) is intentionally not wired yet — costs grow fast,
 * and most sub-accounts only need the homepage's value prop + service blurb.
 */

const FIRECRAWL_BASE = "https://api.firecrawl.dev";

export function firecrawlIsConfigured(): boolean {
  return !!process.env.FIRECRAWL_API_KEY?.trim();
}

export class FirecrawlError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "FirecrawlError";
    this.status = status;
  }
}

interface ScrapeResult {
  markdown: string;
  title: string | null;
  sourceUrl: string;
}

/**
 * Single-page scrape. Returns markdown plus any title Firecrawl extracted.
 * Throws FirecrawlError on non-2xx so the caller can map to a friendly
 * status code for the operator.
 */
export async function scrapeUrl(url: string): Promise<ScrapeResult> {
  const apiKey = process.env.FIRECRAWL_API_KEY?.trim();
  if (!apiKey) {
    throw new FirecrawlError("FIRECRAWL_API_KEY is not configured", 503);
  }

  const res = await fetch(`${FIRECRAWL_BASE}/v1/scrape`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      url,
      formats: ["markdown"],
      onlyMainContent: true,
    }),
    // 30s ceiling — Firecrawl usually returns in <10s for a single page.
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new FirecrawlError(
      `Firecrawl returned ${res.status}: ${text.slice(0, 200)}`,
      res.status,
    );
  }

  const json = (await res.json()) as {
    success?: boolean;
    data?: { markdown?: string; metadata?: { title?: string; sourceURL?: string } };
    error?: string;
  };
  if (!json.success || !json.data?.markdown) {
    throw new FirecrawlError(
      `Firecrawl returned no markdown for ${url}: ${json.error ?? "unknown error"}`,
      502,
    );
  }

  return {
    markdown: json.data.markdown,
    title: json.data.metadata?.title ?? null,
    sourceUrl: json.data.metadata?.sourceURL ?? url,
  };
}
