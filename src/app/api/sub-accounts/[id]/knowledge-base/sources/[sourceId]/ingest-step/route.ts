import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import {
  publishCallback,
  qstashIsConfigured,
  verifyQStashSignature,
} from "@/lib/automations/qstash";
import {
  FirecrawlError,
  getCrawlStatus,
  scrapeUrl,
  startCrawl,
} from "@/lib/firecrawl/client";
import { chunkText } from "@/lib/knowledge-base/chunk";
import { embeddingsConfigured, embedTexts } from "@/lib/embeddings/openai";
import { DEFAULT_MAX_CRAWL_PAGES } from "@/types/knowledge-base";
import type { KnowledgeSourceDoc } from "@/types/knowledge-base";

export const dynamic = "force-dynamic";

/**
 * QStash callback that ingests one Knowledge Base source: fetches its
 * content (Firecrawl for url/crawl, direct for qa/text), chunks it,
 * embeds every chunk (OpenAI), and writes the chunks subcollection.
 * Public path — security is the Upstash-Signature header, same model as
 * every other QStash callback in this codebase.
 *
 * "crawl" sources are async on Firecrawl's side — if a crawl isn't done
 * yet, this reschedules itself to check again, mirroring the website
 * builder's poll-until-terminal loop
 * (src/app/api/sub-accounts/[id]/website/[siteId]/poll/route.ts).
 *
 * Idempotency: a source in a terminal state (ready/failed) is a no-op —
 * a stale QStash retry can't reprocess or duplicate chunks. Non-terminal
 * re-runs are naturally idempotent (re-fetch + re-chunk + overwrite the
 * same chunks), so no transactional claim is needed here, unlike routes
 * where a duplicate real-world side effect (e.g. a social post publish)
 * would be user-visible.
 */

const POLL_INTERVAL_SECONDS = 20;
// ~15 min at 20s/tick — matches the website builder's poll cap.
const MAX_POLL_ATTEMPTS = 45;
const BATCH_WRITE_SIZE = 400; // under Firestore's 500-op batch limit

interface StepPayload {
  subAccountId?: string;
  sourceId?: string;
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string; sourceId: string }> },
) {
  const { id: subAccountId, sourceId } = await ctx.params;

  if (!qstashIsConfigured()) {
    return NextResponse.json(
      { error: "QStash is not configured." },
      { status: 503 },
    );
  }

  const signature = request.headers.get("upstash-signature");
  if (!signature) {
    return NextResponse.json(
      { error: "Missing Upstash-Signature header" },
      { status: 401 },
    );
  }

  const rawBody = await request.text();
  const valid = await verifyQStashSignature(signature, rawBody);
  if (!valid) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: StepPayload;
  try {
    payload = JSON.parse(rawBody) as StepPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (payload.subAccountId !== subAccountId || payload.sourceId !== sourceId) {
    return NextResponse.json(
      { error: "Payload doesn't match path" },
      { status: 400 },
    );
  }

  const db = getAdminDb();
  const ref = db.doc(`subAccounts/${subAccountId}/knowledgeBase/${sourceId}`);
  const snap = await ref.get();
  if (!snap.exists) {
    return NextResponse.json({ ok: true, ignored: "doc-missing" });
  }
  const source = snap.data() as Omit<KnowledgeSourceDoc, "id">;

  if (source.status === "ready" || source.status === "failed") {
    return NextResponse.json({ ok: true, ignored: "already-terminal" });
  }
  if (source.status === "pending") {
    await ref.update({
      status: "processing",
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  if (!embeddingsConfigured()) {
    await ref.update({
      status: "failed",
      errorMessage:
        "OpenAI embeddings aren't configured on this deployment. Set OPENAI_API_KEY.",
      updatedAt: FieldValue.serverTimestamp(),
    });
    return NextResponse.json({ ok: true, settled: "embeddings-not-configured" });
  }

  try {
    let markdown: string | null = null;

    if (source.type === "qa") {
      markdown = `Q: ${source.question}\nA: ${source.answer}`;
    } else if (source.type === "text") {
      markdown = source.rawText;
    } else if (source.type === "url") {
      const result = await scrapeUrl(source.sourceUrl!);
      markdown = result.markdown;
    } else {
      // type === "crawl" — start (first tick) or continue polling an
      // async Firecrawl job.
      let jobId = source.crawlJobId;
      if (!jobId) {
        const started = await startCrawl(
          source.crawlUrl!,
          source.maxPages ?? DEFAULT_MAX_CRAWL_PAGES,
        );
        jobId = started.jobId;
        await ref.update({
          crawlJobId: jobId,
          updatedAt: FieldValue.serverTimestamp(),
        });
      }

      const crawlStatus = await getCrawlStatus(jobId);

      if (crawlStatus.status === "scraping") {
        const attempts = (source.crawlPollAttempts ?? 0) + 1;
        if (attempts > MAX_POLL_ATTEMPTS) {
          await ref.update({
            status: "failed",
            errorMessage:
              "Crawl is taking longer than expected (15+ min). Try a smaller page limit.",
            crawlPollAttempts: attempts,
            updatedAt: FieldValue.serverTimestamp(),
          });
          return NextResponse.json({ ok: true, settled: "timeout" });
        }
        await ref.update({
          crawlPollAttempts: attempts,
          updatedAt: FieldValue.serverTimestamp(),
        });
        const rescheduled = await publishCallback({
          pathname: `/api/sub-accounts/${subAccountId}/knowledge-base/sources/${sourceId}/ingest-step`,
          body: { subAccountId, sourceId },
          delaySeconds: POLL_INTERVAL_SECONDS,
          deduplicationId: `kb_ingest_${sourceId}_${attempts}`,
        });
        if (!rescheduled) {
          await ref.update({
            status: "failed",
            errorMessage: "Couldn't schedule the next crawl check. Try Re-sync.",
            updatedAt: FieldValue.serverTimestamp(),
          });
          return NextResponse.json({ ok: true, settled: "reschedule-failed" });
        }
        return NextResponse.json({ ok: true, deferred: "crawling" });
      }

      if (crawlStatus.status === "failed") {
        await ref.update({
          status: "failed",
          errorMessage: "The crawl failed on Firecrawl's side.",
          updatedAt: FieldValue.serverTimestamp(),
        });
        return NextResponse.json({ ok: true, settled: "crawl-failed" });
      }

      markdown = crawlStatus.markdown;
    }

    if (!markdown?.trim()) {
      await ref.update({
        status: "failed",
        errorMessage: "No content was found at this source.",
        updatedAt: FieldValue.serverTimestamp(),
      });
      return NextResponse.json({ ok: true, settled: "empty" });
    }

    const chunks = chunkText(markdown);
    if (chunks.length === 0) {
      await ref.update({
        status: "failed",
        errorMessage: "No content was found at this source.",
        updatedAt: FieldValue.serverTimestamp(),
      });
      return NextResponse.json({ ok: true, settled: "empty" });
    }

    const embeddings = await embedTexts(chunks);

    // Re-sync case: clear any previously-ingested chunks before writing
    // fresh ones, batched under Firestore's 500-op limit.
    const chunksCol = ref.collection("chunks");
    const oldChunks = await chunksCol.get();
    for (let i = 0; i < oldChunks.docs.length; i += BATCH_WRITE_SIZE) {
      const batch = db.batch();
      oldChunks.docs.slice(i, i + BATCH_WRITE_SIZE).forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }

    for (let i = 0; i < chunks.length; i += BATCH_WRITE_SIZE) {
      const batch = db.batch();
      chunks.slice(i, i + BATCH_WRITE_SIZE).forEach((text, offset) => {
        const order = i + offset;
        batch.set(chunksCol.doc(), {
          text,
          sourceId,
          subAccountId,
          order,
          embedding: FieldValue.vector(embeddings[order]),
          createdAt: FieldValue.serverTimestamp(),
        });
      });
      await batch.commit();
    }

    await ref.update({
      status: "ready",
      chunkCount: chunks.length,
      errorMessage: null,
      lastSyncedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return NextResponse.json({ ok: true, settled: "ready", chunkCount: chunks.length });
  } catch (err) {
    const message =
      err instanceof FirecrawlError || err instanceof Error
        ? err.message
        : "Ingestion failed.";
    console.error(
      `[knowledge-base/ingest] sa=${subAccountId} source=${sourceId} failed:`,
      err,
    );
    await ref.update({
      status: "failed",
      errorMessage: message.slice(0, 500),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return NextResponse.json({ ok: true, settled: "error" });
  }
}
