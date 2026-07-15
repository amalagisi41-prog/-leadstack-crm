import "server-only";

/**
 * Firecrawl client — agency-level integration. One API key per deployment
 * (FIRECRAWL_API_KEY) is shared across every sub-account.
 *
 * Two endpoints wired:
 *   - /v1/scrape — single URL → markdown (also handles PDFs natively).
 *     Used by the legacy single-page website KB and by "url"-type
 *     Knowledge Base sources.
 *   - /v1/crawl — multi-page site crawl, async job (start + poll). Used
 *     by "crawl"-type Knowledge Base sources — see
 *     lib/knowledge-base/ (ingestion pipeline).
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

// ============================================================
// Multi-page crawl — async job (start + poll)
// ============================================================

export type CrawlStatus = "scraping" | "completed" | "failed";

export interface CrawlStatusResult {
  status: CrawlStatus;
  /** Combined markdown of every page crawled so far, each prefixed with
   *  its source URL as a heading — null until at least one page has
   *  been scraped. Safe to read mid-crawl (Firecrawl streams completed
   *  pages into `data` before the job finishes). */
  markdown: string | null;
  pageCount: number;
}

/**
 * Starts an async multi-page crawl rooted at `url`, capped at `limit`
 * pages. Returns Firecrawl's job id — pass it to getCrawlStatus() to
 * poll. Throws FirecrawlError on non-2xx.
 */
export async function startCrawl(
  url: string,
  limit: number,
): Promise<{ jobId: string }> {
  const apiKey = process.env.FIRECRAWL_API_KEY?.trim();
  if (!apiKey) {
    throw new FirecrawlError("FIRECRAWL_API_KEY is not configured", 503);
  }

  const res = await fetch(`${FIRECRAWL_BASE}/v1/crawl`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      url,
      limit,
      scrapeOptions: { formats: ["markdown"], onlyMainContent: true },
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new FirecrawlError(
      `Firecrawl crawl-start returned ${res.status}: ${text.slice(0, 200)}`,
      res.status,
    );
  }

  const json = (await res.json()) as { success?: boolean; id?: string; error?: string };
  if (!json.success || !json.id) {
    throw new FirecrawlError(
      `Firecrawl crawl-start returned no job id for ${url}: ${json.error ?? "unknown error"}`,
      502,
    );
  }
  return { jobId: json.id };
}

/**
 * Polls an in-flight crawl job once. Callers own the poll loop/schedule
 * (see the Knowledge Base ingest worker, which reschedules itself via
 * QStash until this returns status "completed" or "failed" — the same
 * reschedule-until-terminal pattern the website builder's poll route
 * uses for gitpage builds).
 */
export async function getCrawlStatus(jobId: string): Promise<CrawlStatusResult> {
  const apiKey = process.env.FIRECRAWL_API_KEY?.trim();
  if (!apiKey) {
    throw new FirecrawlError("FIRECRAWL_API_KEY is not configured", 503);
  }

  const res = await fetch(`${FIRECRAWL_BASE}/v1/crawl/${jobId}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new FirecrawlError(
      `Firecrawl crawl-status returned ${res.status}: ${text.slice(0, 200)}`,
      res.status,
    );
  }

  const json = (await res.json()) as {
    status?: string;
    data?: { markdown?: string; metadata?: { sourceURL?: string } }[];
  };

  const pages = json.data ?? [];
  const markdown =
    pages.length > 0
      ? pages
          .filter((p) => p.markdown?.trim())
          .map((p) => `# ${p.metadata?.sourceURL ?? "page"}\n\n${p.markdown}`)
          .join("\n\n---\n\n")
      : null;

  const status: CrawlStatus =
    json.status === "completed"
      ? "completed"
      : json.status === "failed"
        ? "failed"
        : "scraping";

  return { status, markdown, pageCount: pages.length };
}
