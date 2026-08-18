import "server-only";

import { firecrawlIsConfigured, scrapeUrl } from "@/lib/firecrawl/client";

/**
 * Reading an agent's public page — and saying something useful when it can't
 * be read.
 *
 * Business Blueprint import is the first thing a new operator does, and the
 * page they paste is very often a portal profile (Homes.com, Zillow,
 * Realtor.com) that answers a server-side request with a bot wall rather than
 * a bio. That is normal and expected. What is not acceptable is the reply they
 * used to get: "Could not read that website." — no reason, no next step, on
 * the very first screen of the product.
 *
 * So every failure here resolves to a named reason, and every reason maps to a
 * sentence that says what happened and what to do instead. Manual entry is
 * always offered, because it always works.
 *
 * On identifying ourselves: the user agent below says what this is. A browser
 * string would get past more bot walls, and that is exactly why it is not used
 * — the operator's page is public, but the site owner's rate limiting is
 * theirs to set. When a wall blocks us we say so and offer another route.
 * Please do not "fix" this by pretending to be Chrome.
 */

const PROFILE_IMPORT_UA =
  "Mozilla/5.0 (compatible; AgentStackProfileImport/1.0; +https://agentstackcrm.app)";

/** Text handed to the extraction model. Beyond this is prompt budget burned. */
const MAX_TEXT = 18_000;

/**
 * Zillow repeats listing cards before the agent contact and service-area
 * sections. A simple prefix truncation therefore drops the exact facts the
 * Blueprint needs. Keep a bounded head and tail for Zillow: the head contains
 * the summary/bio, while the tail contains contact details and service areas.
 */
function extractionText(target: string, text: string): string {
  let host = "";
  try {
    host = new URL(target).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    // The URL is already vetted by the caller; retain the safe generic path.
  }
  if (host === "zillow.com" || host.endsWith(".zillow.com")) {
    const ZILLOW_SEGMENT = 30_000;
    if (text.length > ZILLOW_SEGMENT * 2) {
      return `${text.slice(0, ZILLOW_SEGMENT)}\n\n[...listing history omitted...]\n\n${text.slice(-ZILLOW_SEGMENT)}`;
    }
    return text;
  }
  return text.slice(0, MAX_TEXT);
}

/** Response body ceiling, before tag stripping. */
const MAX_BODY = 250_000;

const DIRECT_TIMEOUT_MS = 10_000;
const READER_TIMEOUT_MS = 14_000;
const MAX_REDIRECTS = 4;

/**
 * Wall-clock ceiling for the whole read, across every route it tries.
 *
 * Per-request timeouts are not enough on their own: three attempts that each
 * come in under their own limit still add up past what the platform allows a
 * serverless function to run for, and a function killed by the gateway
 * returns an empty body — which reaches the operator as a raw
 * "Unexpected end of JSON input" rather than anything about their website.
 *
 * Kept deliberately tight: reading is the cheap half, and every second spent
 * here is a second the extraction model does not get. The route hands the
 * model whatever this leaves behind.
 */
export const READ_BUDGET_MS = 16_000;

/** Below this there is no point starting another attempt. */
const MIN_ATTEMPT_MS = 2_500;

// ---------------------------------------------------------------------------
// URL vetting
// ---------------------------------------------------------------------------

/**
 * Hostnames that resolve inside the deployment rather than on the internet.
 *
 * The IPv6 unique-local patterns are anchored on the hex-quad-and-colon shape
 * rather than a bare "fc"/"fd" prefix. A prefix check reads `fc-realty.com` as
 * a private address and rejects a real estate agent's real website.
 */
const PRIVATE_HOST_PATTERNS: RegExp[] = [
  /^localhost$/i,
  /\.localhost$/i,
  /\.internal$/i,
  /\.local$/i,
  /^0\.0\.0\.0$/,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^169\.254\./, // link-local, incl. cloud metadata at 169.254.169.254
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^::1$/,
  /^f[cd][\da-f]{2}:/i,
  /^fe80:/i,
];

/**
 * Parse and vet a public http(s) URL, returning the normalised string.
 *
 * Anything reaching this is attacker-controllable in the way that matters: an
 * operator types it and the server fetches it. Unchecked, that is an SSRF into
 * the hosting network.
 */
export function safePublicUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw) return null;

  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.username || url.password) return null;

  const host = url.hostname.toLowerCase();
  if (!host) return null;
  const bare = host.replace(/^\[|\]$/g, "");
  // A single-label host ("intranet") only resolves against an internal search
  // domain, so it can never be the public page the operator meant.
  const isIpv6 = /^[\da-f:]+$/i.test(bare);
  if (!host.includes(".") && !isIpv6) return null;
  if (PRIVATE_HOST_PATTERNS.some((pattern) => pattern.test(bare))) return null;

  return url.toString();
}

// ---------------------------------------------------------------------------
// Reading the page text
// ---------------------------------------------------------------------------

export function readableText(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The reader service takes the full absolute URL as its path, scheme included.
 *
 * The bug this replaces prefixed a second scheme, producing
 * `https://r.jina.ai/http://https://www.homes.com/...`, so the fallback that
 * exists to rescue a blocked page failed on every single call — which is how
 * every portal import ended at the generic error.
 */
export function readerUrl(target: string): string {
  return `https://r.jina.ai/${target}`;
}

export type PageQuality = "readable" | "blocked" | "thin";

/**
 * Bot walls that are unambiguous wherever they appear in a page.
 *
 * These strings do not occur in an estate agent's bio.
 */
const HARD_BLOCK: RegExp[] = [
  /attention required!?\s*\|?\s*cloudflare/i,
  /checking your browser before accessing/i,
  /enable javascript and cookies to continue/i,
  /request unsuccessful\.[\s\S]{0,120}incapsula/i,
  /pardon our interruption/i,
  /press (?:and hold|&\s*hold) to confirm you are a human/i,
  /\berror code:? ?1015\b/i,
];

/**
 * Weaker signals, trusted only on a short page.
 *
 * "Access denied" inside forty thousand characters of listings copy is a
 * coincidence; on a four-hundred-character page it is the whole page.
 */
const SOFT_BLOCK: RegExp[] = [
  /\baccess denied\b/i,
  /\bjust a moment\b/i,
  /you (?:don'?t|do not) have permission to access/i,
  /\bcaptcha\b/i,
  /verify (?:that )?you(?:'re| are)? (?:a )?human/i,
  /(?:please )?enable javascript/i,
  /unusual traffic from your/i,
  /\b403 forbidden\b/i,
];

const SOFT_BLOCK_MAX_LENGTH = 2_000;

/**
 * Below this there is no profile to extract, and handing it to the model
 * produces a confident summary of a navigation bar.
 */
const MIN_READABLE_LENGTH = 400;

export function classifyPageText(raw: string): PageQuality {
  const text = raw.trim();
  if (HARD_BLOCK.some((pattern) => pattern.test(text))) return "blocked";
  if (
    text.length <= SOFT_BLOCK_MAX_LENGTH &&
    SOFT_BLOCK.some((pattern) => pattern.test(text))
  ) {
    return "blocked";
  }
  if (text.length < MIN_READABLE_LENGTH) return "thin";
  return "readable";
}

// ---------------------------------------------------------------------------
// Failures, and what to tell the operator
// ---------------------------------------------------------------------------

export type ReadFailure =
  | "blocked" // a bot wall, a 403, or a rate limit
  | "missing" // the link is dead
  | "private" // behind a login or paywall
  | "provider-error" // their server is broken right now
  | "not-a-page" // a file, not a web page
  | "unreadable" // 200, but the text is drawn by JavaScript
  | "too-slow" // the budget ran out before anything answered
  | "unreachable"; // DNS, TLS, or a redirect loop

export class PageReadError extends Error {
  readonly reason: ReadFailure;
  constructor(message: string, reason: ReadFailure) {
    super(message);
    this.name = "PageReadError";
    this.reason = reason;
  }
}

/**
 * Which of several failed attempts to report.
 *
 * A definite statement about the operator's own link ("that page is gone")
 * beats a statement about the transport ("we timed out"), because only the
 * former tells them what to change.
 */
const INFORMATIVENESS: Record<ReadFailure, number> = {
  missing: 7,
  private: 6,
  "not-a-page": 5,
  blocked: 4,
  unreadable: 3,
  "provider-error": 2,
  "too-slow": 1,
  unreachable: 0,
};

/** Portals whose profile pages an agent is most likely to paste. */
const PORTAL_NAMES: Record<string, string> = {
  "homes.com": "Homes.com",
  "zillow.com": "Zillow",
  "trulia.com": "Trulia",
  "realtor.com": "Realtor.com",
  "redfin.com": "Redfin",
  "compass.com": "Compass",
  "facebook.com": "Facebook",
  "instagram.com": "Instagram",
  "linkedin.com": "LinkedIn",
  "yelp.com": "Yelp",
};

function siteName(url: string): string {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "That site";
  }
  for (const [domain, name] of Object.entries(PORTAL_NAMES)) {
    if (host === domain || host.endsWith(`.${domain}`)) return name;
  }
  return host;
}

const BY_HAND = "or fill your Blueprint in by hand — every field here is editable";

/**
 * The whole point of this module: a sentence naming what happened and what to
 * do next. There is no branch that leaves the operator without a next step.
 */
export function readFailureMessage(
  reason: ReadFailure,
  url: string,
  status?: number
): string {
  const site = siteName(url);
  switch (reason) {
    case "blocked":
      return `${site} blocks automated reading, so we could not pull your details from that page. Paste your brokerage or personal website instead — an About or agent-bio page works best — ${BY_HAND}.`;
    case "missing":
      return `${site} says that page no longer exists. Open the link in your browser to check it, then paste the address it lands on.`;
    case "private":
      return `That page is behind a login, so we cannot reach it. Paste a link that opens in a private browser window, ${BY_HAND}.`;
    case "provider-error":
      return `${site} is returning an error right now${
        status ? ` (${status})` : ""
      }. That is on their end — wait a few minutes and try again, ${BY_HAND}.`;
    case "not-a-page":
      return `That link points at a file rather than a web page. Paste the address of the page it sits on instead.`;
    case "unreadable":
      return `${site} draws that page in the browser, so there was no text for us to read. Try a page that shows your bio as plain text — a brokerage profile or About page usually works — ${BY_HAND}.`;
    case "too-slow":
      return `${site} did not answer in time. Big portal profiles are often too slow to read this way — try your brokerage or personal website instead, ${BY_HAND}.`;
    case "unreachable":
      return `We could not reach ${site}. Check the address is right and that the site is up, then try again, ${BY_HAND}.`;
  }
}

function statusReason(status: number): ReadFailure {
  if (status === 401 || status === 402 || status === 407) return "private";
  if (status === 404 || status === 410) return "missing";
  if (status >= 500) return "provider-error";
  return "blocked"; // 403, 429, 451, and every other 4xx a wall returns
}

// ---------------------------------------------------------------------------
// The attempts
// ---------------------------------------------------------------------------

interface Attempt {
  reason: ReadFailure;
  status?: number;
}

type ReadOutcome =
  | { ok: true; text: string }
  | { ok: false; failure: Attempt };

function fromQuality(
  quality: PageQuality,
  text: string,
  target: string,
): ReadOutcome {
  if (quality === "readable") return { ok: true, text: extractionText(target, text) };
  return {
    ok: false,
    failure: { reason: quality === "blocked" ? "blocked" : "unreadable" },
  };
}

/**
 * Firecrawl, when a key is configured.
 *
 * A Firecrawl failure never produces a verdict about the operator's page. Its
 * 401s and 402s are our billing state, not their website, and its error text
 * names our API key — so anything short of usable markdown falls through to
 * the direct read, which can speak accurately about their link.
 */
async function readViaFirecrawl(target: string): Promise<string | null> {
  if (!firecrawlIsConfigured()) return null;
  try {
    const { markdown } = await scrapeUrl(target);
    if (classifyPageText(markdown) !== "readable") return null;
    return extractionText(target, markdown);
  } catch {
    return null;
  }
}

/**
 * Give up waiting on an attempt once the budget says so.
 *
 * The abandoned promise is left to settle on its own — every attempt here
 * resolves rather than rejects, so nothing is left unhandled.
 */
async function withinBudget<T>(
  work: Promise<T>,
  ms: number,
  onExpiry: T
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(onExpiry), Math.max(ms, 0));
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function readDirect(
  startUrl: string,
  timeoutMs: number
): Promise<ReadOutcome> {
  let current = startUrl;

  for (let hop = 0; hop < MAX_REDIRECTS; hop += 1) {
    let response: Response;
    try {
      response = await fetch(current, {
        headers: {
          "User-Agent": PROFILE_IMPORT_UA,
          Accept: "text/html,application/xhtml+xml,text/plain;q=0.9",
          "Accept-Language": "en-US,en;q=0.9",
        },
        redirect: "manual",
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      const reason =
        error instanceof Error && error.name === "TimeoutError"
          ? "too-slow"
          : "unreachable";
      return { ok: false, failure: { reason } };
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      let next: string | null = null;
      try {
        next = location ? safePublicUrl(new URL(location, current).toString()) : null;
      } catch {
        next = null;
      }
      if (!next) return { ok: false, failure: { reason: "unreachable" } };
      current = next;
      continue;
    }

    if (!response.ok) {
      return {
        ok: false,
        failure: { reason: statusReason(response.status), status: response.status },
      };
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!/text\/html|text\/plain|application\/xhtml/i.test(contentType)) {
      return { ok: false, failure: { reason: "not-a-page" } };
    }

    const body = (await response.text().catch(() => "")).slice(0, MAX_BODY);
    const text = readableText(body);
    return fromQuality(classifyPageText(text), text, startUrl);
  }

  return { ok: false, failure: { reason: "unreachable" } };
}

/** The reader service reports the target's status inside its own 200 body. */
const READER_TARGET_STATUS = /target url returned error (\d{3})/i;

async function readViaReader(
  target: string,
  timeoutMs: number
): Promise<ReadOutcome> {
  let response: Response;
  try {
    response = await fetch(readerUrl(target), {
      headers: { Accept: "text/plain", "User-Agent": PROFILE_IMPORT_UA },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const reason =
      error instanceof Error && error.name === "TimeoutError"
        ? "too-slow"
        : "unreachable";
    return { ok: false, failure: { reason } };
  }

  if (!response.ok) {
    return {
      ok: false,
      failure: { reason: statusReason(response.status), status: response.status },
    };
  }

  const text = (await response.text().catch(() => "")).slice(0, MAX_BODY).trim();

  const relayed = READER_TARGET_STATUS.exec(text);
  if (relayed) {
    const status = Number(relayed[1]);
    return { ok: false, failure: { reason: statusReason(status), status } };
  }

  return fromQuality(classifyPageText(text), text, target);
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

export function mostInformative(attempts: readonly Attempt[]): Attempt {
  return attempts.reduce((worst, attempt) =>
    INFORMATIVENESS[attempt.reason] > INFORMATIVENESS[worst.reason]
      ? attempt
      : worst
  );
}

/**
 * Read a public page as plain text, trying every route we have before giving
 * up, and throwing a PageReadError the operator can act on when none work.
 */
export async function readPublicPage(
  startUrl: string,
  budgetMs: number = READ_BUDGET_MS
): Promise<string> {
  const deadline = Date.now() + budgetMs;
  const left = () => deadline - Date.now();
  const attempts: Attempt[] = [];

  // Firecrawl renders the page properly, so it is the only route that reads a
  // JavaScript-built portal profile. It is also the slowest, hence the race —
  // and hence the half-budget cap: a scrape that overruns must still leave
  // the two cheaper routes a turn rather than consuming everything.
  const scraped = await withinBudget(
    readViaFirecrawl(startUrl),
    Math.min(left() / 2, 12_000),
    null
  );
  if (scraped) return scraped;

  if (left() >= MIN_ATTEMPT_MS) {
    const direct = await readDirect(
      startUrl,
      Math.min(left(), DIRECT_TIMEOUT_MS)
    );
    if (direct.ok) return direct.text;
    attempts.push(direct.failure);

    // A dead link is dead for the reader service too. Skipping it keeps a
    // definite answer fast instead of spending the rest of the budget
    // confirming it.
    if (direct.failure.reason !== "missing" && left() >= MIN_ATTEMPT_MS) {
      const relayed = await readViaReader(
        startUrl,
        Math.min(left(), READER_TIMEOUT_MS)
      );
      if (relayed.ok) return relayed.text;
      attempts.push(relayed.failure);
    }
  }

  // Everything overran rather than answering.
  if (attempts.length === 0) attempts.push({ reason: "too-slow" });

  const worst = mostInformative(attempts);
  throw new PageReadError(
    readFailureMessage(worst.reason, startUrl, worst.status),
    worst.reason
  );
}
