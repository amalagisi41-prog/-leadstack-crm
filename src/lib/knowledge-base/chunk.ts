/**
 * Pure chunking helper for the AI Agent Knowledge Base — splits a source's
 * raw text/markdown into overlapping chunks sized for embedding + retrieval.
 * No I/O, no tokenizer dependency (char-length heuristic, consistent with
 * the existing MAX_KB_CHARS convention elsewhere in this codebase) — safe
 * to unit-test and import on either side.
 *
 * Strategy: paragraph-aware greedy packing. Paragraphs (blank-line
 * separated) are appended to the current chunk until it would exceed
 * maxChars, then a new chunk starts, seeded with the tail of the previous
 * chunk (overlapChars) so retrieval doesn't lose context at a chunk
 * boundary. A single paragraph longer than maxChars is hard-split.
 */

export interface ChunkOptions {
  maxChars?: number;
  overlapChars?: number;
}

const DEFAULT_MAX_CHARS = 2800;
const DEFAULT_OVERLAP_CHARS = 100;

function splitParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

/** Hard-splits a single oversized paragraph into maxChars pieces with
 *  overlapChars of trailing context carried into the next piece. */
function hardSplit(
  paragraph: string,
  maxChars: number,
  overlapChars: number,
): string[] {
  const pieces: string[] = [];
  let start = 0;
  while (start < paragraph.length) {
    const end = Math.min(start + maxChars, paragraph.length);
    pieces.push(paragraph.slice(start, end));
    if (end >= paragraph.length) break;
    start = end - overlapChars;
  }
  return pieces;
}

export function chunkText(text: string, opts?: ChunkOptions): string[] {
  const maxChars = opts?.maxChars ?? DEFAULT_MAX_CHARS;
  const overlapChars = opts?.overlapChars ?? DEFAULT_OVERLAP_CHARS;

  const paragraphs = splitParagraphs(text);
  if (paragraphs.length === 0) return [];

  const chunks: string[] = [];
  let current = "";

  function flush() {
    const trimmed = current.trim();
    if (trimmed.length > 0) chunks.push(trimmed);
    current = "";
  }

  for (const paragraph of paragraphs) {
    // A paragraph that alone exceeds maxChars can't be appended whole —
    // flush what we have, hard-split it, and carry only its own overlap
    // tail forward as the seed for the next chunk.
    if (paragraph.length > maxChars) {
      flush();
      const pieces = hardSplit(paragraph, maxChars, overlapChars);
      chunks.push(...pieces.slice(0, -1));
      current = pieces[pieces.length - 1] ?? "";
      continue;
    }

    const candidate = current ? `${current}\n\n${paragraph}` : paragraph;
    if (candidate.length <= maxChars) {
      current = candidate;
      continue;
    }

    // Adding this paragraph would overflow — close the current chunk,
    // seed the next one with its trailing overlapChars for continuity.
    const overlapSeed = current.slice(-overlapChars).trim();
    flush();
    current = overlapSeed ? `${overlapSeed}\n\n${paragraph}` : paragraph;
  }
  flush();

  return chunks;
}
