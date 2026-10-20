import "server-only";

/**
 * Creatify client — turns a listing's own photo into a short video via
 * their "Aurora" image-to-video endpoint. Self-serve API (API Starter
 * $99/mo, confirmed on their own FAQ/billing pages as of this writing),
 * unlike AdCreative.ai's enterprise-only gate — one agency-level key pair
 * covers every sub-account, same shape as FIRECRAWL_API_KEY/OPENAI_API_KEY.
 *
 * VERIFY BEFORE RELYING ON IN PRODUCTION: Creatify's own API reference
 * (docs.creatify.ai) was unreachable from this environment when this file
 * was written — egress-blocked, the same class of limitation this repo's
 * CLAUDE.md already documents for narrpr.com. The base URL and exact
 * request/response field names below come from Creatify's public FAQ and a
 * third-party API directory, not a direct read of the reference docs. Treat
 * BASE_URL and the body shape in createImageToVideoJob/getVideoJobStatus as
 * the thing to confirm first if a real call 404s or the response doesn't
 * parse — not a sign this integration is fundamentally wrong.
 */

const BASE_URL = "https://api.creatify.ai/api";

export function creatifyIsConfigured(): boolean {
  return !!process.env.CREATIFY_API_ID?.trim() && !!process.env.CREATIFY_API_KEY?.trim();
}

export class CreatifyError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "CreatifyError";
    this.status = status;
  }
}

function authHeaders(): Record<string, string> {
  return {
    "X-API-ID": process.env.CREATIFY_API_ID?.trim() ?? "",
    "X-API-KEY": process.env.CREATIFY_API_KEY?.trim() ?? "",
    "Content-Type": "application/json",
  };
}

export interface CreatifyVideoJob {
  jobId: string;
  status: "queued" | "processing" | "done" | "failed";
  videoUrl: string | null;
  error: string | null;
}

/**
 * Starts an Aurora image-to-video job from one listing photo plus a short
 * script (the brief's own copy — never invented text). Async: returns a job
 * id to poll via getVideoJobStatus(), it does not wait for the render.
 */
export async function createImageToVideoJob(args: {
  imageUrl: string;
  script: string;
}): Promise<{ jobId: string }> {
  if (!creatifyIsConfigured()) {
    throw new CreatifyError("CREATIFY_API_ID/CREATIFY_API_KEY are not configured", 503);
  }

  const res = await fetch(`${BASE_URL}/aurora/`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      image_url: args.imageUrl,
      script: args.script,
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new CreatifyError(
      `Creatify returned ${res.status}: ${text.slice(0, 200)}`,
      res.status
    );
  }

  const json = (await res.json().catch(() => ({}))) as { id?: string };
  if (!json.id) {
    throw new CreatifyError("Creatify did not return a job id", 502);
  }
  return { jobId: json.id };
}

/** Polls one Aurora job's status. Never throws on a "still processing" result. */
export async function getVideoJobStatus(jobId: string): Promise<CreatifyVideoJob> {
  if (!creatifyIsConfigured()) {
    throw new CreatifyError("CREATIFY_API_ID/CREATIFY_API_KEY are not configured", 503);
  }

  const res = await fetch(`${BASE_URL}/aurora/${jobId}/`, {
    method: "GET",
    headers: authHeaders(),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new CreatifyError(
      `Creatify returned ${res.status}: ${text.slice(0, 200)}`,
      res.status
    );
  }

  const json = (await res.json().catch(() => ({}))) as {
    status?: string;
    video_output?: string;
    error?: string;
  };

  const rawStatus = (json.status ?? "").toLowerCase();
  const status: CreatifyVideoJob["status"] =
    rawStatus === "done" || rawStatus === "success"
      ? "done"
      : rawStatus === "failed" || rawStatus === "error"
        ? "failed"
        : rawStatus === "pending" || rawStatus === "queued"
          ? "queued"
          : "processing";

  return {
    jobId,
    status,
    videoUrl: json.video_output ?? null,
    error: status === "failed" ? json.error ?? "Creatify reported a failure." : null,
  };
}
