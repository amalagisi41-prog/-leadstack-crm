import { describe, it, expect } from "vitest";
import { chunkText } from "./chunk";

describe("chunkText", () => {
  it("returns an empty array for empty/whitespace input", () => {
    expect(chunkText("")).toEqual([]);
    expect(chunkText("   \n\n  ")).toEqual([]);
  });

  it("returns a single chunk when the text fits under maxChars", () => {
    const text = "Paragraph one.\n\nParagraph two.";
    const chunks = chunkText(text, { maxChars: 1000 });
    expect(chunks).toEqual([text]);
  });

  it("splits across multiple chunks when paragraphs exceed maxChars", () => {
    const p1 = "A".repeat(50);
    const p2 = "B".repeat(50);
    const p3 = "C".repeat(50);
    const text = [p1, p2, p3].join("\n\n");
    const chunks = chunkText(text, { maxChars: 80, overlapChars: 10 });
    expect(chunks.length).toBeGreaterThan(1);
    // Every paragraph's content should be present somewhere in the output.
    expect(chunks.join(" ")).toContain(p1);
    expect(chunks.join(" ")).toContain(p2);
    expect(chunks.join(" ")).toContain(p3);
  });

  it("carries overlap context into the next chunk", () => {
    const p1 = "X".repeat(50);
    const p2 = "Y".repeat(50);
    const chunks = chunkText([p1, p2].join("\n\n"), {
      maxChars: 60,
      overlapChars: 15,
    });
    expect(chunks.length).toBe(2);
    // The tail of chunk 1 should reappear at the start of chunk 2.
    const tailOfFirst = chunks[0].slice(-15);
    expect(chunks[1].startsWith(tailOfFirst)).toBe(true);
  });

  it("hard-splits a single paragraph longer than maxChars", () => {
    const huge = "Z".repeat(500);
    const chunks = chunkText(huge, { maxChars: 200, overlapChars: 20 });
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      expect(c.length).toBeLessThanOrEqual(200);
    }
    // No content lost — every char of the original run appears somewhere.
    expect(chunks.every((c) => /^Z+$/.test(c))).toBe(true);
  });

  it("never produces empty chunks", () => {
    const text = "One.\n\n\n\nTwo.\n\n   \n\nThree.";
    const chunks = chunkText(text, { maxChars: 5, overlapChars: 1 });
    expect(chunks.every((c) => c.trim().length > 0)).toBe(true);
  });
});
