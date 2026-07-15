import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { embeddingsConfigured, embedTexts } from "@/lib/embeddings/openai";

/**
 * Retrieval step for the AI Agent Knowledge Base — embeds the current
 * inbound message and runs a Firestore vector search across every
 * ingested chunk for the sub-account, returning only the top-K most
 * relevant snippets. Called once per inbound message by every channel
 * orchestrator right before buildSystemPrompt() (see prompt.ts).
 *
 * Best-effort by design: any failure (embeddings not configured, no
 * index provisioned yet, a transient API error) returns an empty array
 * rather than throwing — a knowledge base is enrichment, never something
 * that should block a reply from going out.
 */
export async function retrieveRelevantChunks(
  subAccountId: string,
  queryText: string,
  topK = 5,
): Promise<string[]> {
  const trimmed = queryText.trim();
  if (!embeddingsConfigured() || !trimmed) return [];

  try {
    const [queryEmbedding] = await embedTexts([trimmed]);
    if (!queryEmbedding) return [];

    const snap = await getAdminDb()
      .collectionGroup("chunks")
      .where("subAccountId", "==", subAccountId)
      .findNearest({
        vectorField: "embedding",
        queryVector: FieldValue.vector(queryEmbedding),
        limit: topK,
        distanceMeasure: "COSINE",
      })
      .get();

    return snap.docs
      .map((d) => (d.data() as { text?: string }).text)
      .filter((t): t is string => !!t?.trim());
  } catch (err) {
    console.error(
      `[knowledge-base/retrieve] sa=${subAccountId} failed:`,
      err,
    );
    return [];
  }
}
