import {
  DEFAULT_MAX_CRAWL_PAGES,
  type KnowledgeSourceType,
} from "@/types/knowledge-base";

/**
 * Validates the create-source request body for the AI Agent Knowledge
 * Base. Pure — no I/O — so it's usable from both the route handler and
 * (if ever needed) a test file without mounting Firestore.
 */

export interface ValidatedSourceInput {
  type: KnowledgeSourceType;
  label: string;
  sourceUrl: string | null;
  crawlUrl: string | null;
  maxPages: number | null;
  question: string | null;
  answer: string | null;
  rawText: string | null;
}

const MAX_LABEL_CHARS = 80;
const MAX_URL_CHARS = 2000;
const MAX_QA_CHARS = 2000;
const MAX_TEXT_CHARS = 20_000;
const MIN_CRAWL_PAGES = 1;
const MAX_CRAWL_PAGES = 50;

function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export function validateSourceInput(
  body: unknown,
): { ok: true; value: ValidatedSourceInput } | { ok: false; error: string } {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: "Invalid request body." };
  }
  const b = body as Record<string, unknown>;

  const type = b.type;
  if (
    type !== "url" &&
    type !== "crawl" &&
    type !== "qa" &&
    type !== "text"
  ) {
    return {
      ok: false,
      error: "type must be one of: url, crawl, qa, text.",
    };
  }

  const label = (typeof b.label === "string" ? b.label : "").trim().slice(0, MAX_LABEL_CHARS);
  if (!label) {
    return { ok: false, error: "A label is required." };
  }

  if (type === "url") {
    const sourceUrl = (typeof b.sourceUrl === "string" ? b.sourceUrl : "").trim().slice(0, MAX_URL_CHARS);
    if (!isHttpUrl(sourceUrl)) {
      return { ok: false, error: "A valid http(s) URL is required." };
    }
    return {
      ok: true,
      value: {
        type,
        label,
        sourceUrl,
        crawlUrl: null,
        maxPages: null,
        question: null,
        answer: null,
        rawText: null,
      },
    };
  }

  if (type === "crawl") {
    const crawlUrl = (typeof b.crawlUrl === "string" ? b.crawlUrl : "").trim().slice(0, MAX_URL_CHARS);
    if (!isHttpUrl(crawlUrl)) {
      return { ok: false, error: "A valid http(s) URL is required." };
    }
    const rawMaxPages = typeof b.maxPages === "number" ? Math.floor(b.maxPages) : DEFAULT_MAX_CRAWL_PAGES;
    const maxPages = Math.min(MAX_CRAWL_PAGES, Math.max(MIN_CRAWL_PAGES, rawMaxPages));
    return {
      ok: true,
      value: {
        type,
        label,
        sourceUrl: null,
        crawlUrl,
        maxPages,
        question: null,
        answer: null,
        rawText: null,
      },
    };
  }

  if (type === "qa") {
    const question = (typeof b.question === "string" ? b.question : "").trim().slice(0, MAX_QA_CHARS);
    const answer = (typeof b.answer === "string" ? b.answer : "").trim().slice(0, MAX_QA_CHARS);
    if (!question || !answer) {
      return { ok: false, error: "Both a question and an answer are required." };
    }
    return {
      ok: true,
      value: {
        type,
        label,
        sourceUrl: null,
        crawlUrl: null,
        maxPages: null,
        question,
        answer,
        rawText: null,
      },
    };
  }

  // type === "text"
  const rawText = (typeof b.rawText === "string" ? b.rawText : "").trim().slice(0, MAX_TEXT_CHARS);
  if (!rawText) {
    return { ok: false, error: "Paste some text first." };
  }
  return {
    ok: true,
    value: {
      type,
      label,
      sourceUrl: null,
      crawlUrl: null,
      maxPages: null,
      question: null,
      answer: null,
      rawText,
    },
  };
}
