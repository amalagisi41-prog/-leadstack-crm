import type { Timestamp, FieldValue } from "firebase/firestore";

/**
 * AI Agent Knowledge Base v2 — multi-source, retrieval-backed.
 *
 * Replaces the old single-page `aiAgent/profile.websiteKb` snapshot with a
 * real collection of sources (`subAccounts/{id}/knowledgeBase/{sourceId}`),
 * each chunked + embedded into a `chunks` subcollection at ingest time.
 * Retrieval (`lib/knowledge-base/retrieve.ts`) runs a Firestore vector
 * search per inbound message and injects only the top-K relevant chunks
 * into the system prompt — see `lib/comms/ai/prompt.ts`.
 *
 * The structured Business Profile (`types/business-profile.ts`) is
 * separate and NOT part of this system — it's compact, operator-typed,
 * and always fully included in every prompt. This collection is for bulk
 * reference material (websites, crawls, documents, long-form text) where
 * retrieval actually matters.
 */

export type KnowledgeSourceType = "url" | "crawl" | "qa" | "text";

export type KnowledgeSourceStatus =
  | "pending"
  | "processing"
  | "ready"
  | "failed";

export interface KnowledgeSourceDoc {
  id: string;
  subAccountId: string;
  agencyId: string;
  type: KnowledgeSourceType;
  /** Operator-facing name, e.g. "Buyer FAQ page" or "Pricing sheet". */
  label: string;

  /** type: "url" — a single webpage or PDF URL, scraped via Firecrawl. */
  sourceUrl: string | null;

  /** type: "crawl" — a root URL crawled up to maxPages via Firecrawl. */
  crawlUrl: string | null;
  maxPages: number | null;
  /** Firecrawl's async crawl job id — set while a crawl is in flight so
   *  the poll step can resume checking status across QStash retries. */
  crawlJobId: string | null;
  /** How many times the ingest worker has polled an in-flight crawl.
   *  Capped (see the ingest-step route) so a stuck Firecrawl job doesn't
   *  poll forever. 0 for non-crawl source types. */
  crawlPollAttempts: number;

  /** type: "qa" — a single manually-entered question/answer pair. */
  question: string | null;
  answer: string | null;

  /** type: "text" — manually pasted long-form content (a policy, a
   *  script, anything not hosted at a public URL). */
  rawText: string | null;

  status: KnowledgeSourceStatus;
  errorMessage: string | null;
  chunkCount: number;
  lastSyncedAt: Timestamp | FieldValue | null;

  createdByUid: string;
  createdAt: Timestamp | FieldValue | null;
  updatedAt: Timestamp | FieldValue | null;
}

/** One retrievable chunk of a source's content, embedded at ingest time.
 *  Lives at `.../knowledgeBase/{sourceId}/chunks/{chunkId}`. The
 *  `embedding` field is a Firestore VectorValue (firebase-admin only —
 *  not represented here since this type is shared with client code that
 *  never reads chunks directly; see lib/knowledge-base/retrieve.ts for
 *  the admin-side shape). */
export interface KnowledgeChunkDoc {
  text: string;
  sourceId: string;
  /** Denormalized so a collectionGroup("chunks") query can filter to one
   *  sub-account without a join. */
  subAccountId: string;
  /** Position within the source — useful for debugging/citation, not
   *  used in retrieval ranking. */
  order: number;
  createdAt: Timestamp | FieldValue | null;
}

export const DEFAULT_MAX_CRAWL_PAGES = 20;

export const KNOWLEDGE_SOURCE_TYPE_LABELS: Record<
  KnowledgeSourceType,
  string
> = {
  url: "Webpage or PDF",
  crawl: "Crawl a site",
  qa: "Manual Q&A",
  text: "Pasted text",
};
