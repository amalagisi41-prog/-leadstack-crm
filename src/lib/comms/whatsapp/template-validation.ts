import {
  isWhatsappMergeTag,
  type WhatsappTemplateVariable,
} from "@/types/whatsapp-templates";

/**
 * Shared validation for WhatsApp template bodies + variables. Used by the
 * create + edit routes so both enforce the same rules: positions must be
 * contiguous from {{1}}, every body placeholder has a matching variable
 * definition (and vice-versa), each variable has a sample value (Meta needs
 * it for review), and merge-tag-sourced variables map to an allow-listed tag.
 */

/** Parse the distinct positional placeholders ({{1}}, {{2}}…) in a body. */
export function parseBodyPositions(body: string): number[] {
  const out = new Set<number>();
  const re = /\{\{\s*(\d+)\s*\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) out.add(Number(m[1]));
  return [...out].sort((a, b) => a - b);
}

export function sanitiseVariables(
  raw: unknown,
  body: string,
): { variables: WhatsappTemplateVariable[] } | { error: string } {
  if (!Array.isArray(raw)) return { error: "variables must be an array" };
  const positions = parseBodyPositions(body);
  for (let i = 0; i < positions.length; i++) {
    if (positions[i] !== i + 1) {
      return {
        error: `Template variables must be numbered contiguously from {{1}}. Found {{${positions[i]}}} out of sequence.`,
      };
    }
  }
  const byPos = new Map<number, WhatsappTemplateVariable>();
  for (const v of raw) {
    if (!v || typeof v !== "object") return { error: "Invalid variable entry" };
    const r = v as Record<string, unknown>;
    const position = Number(r.position);
    if (!Number.isInteger(position) || position < 1) {
      return { error: "Each variable needs a positive integer position" };
    }
    const label = typeof r.label === "string" ? r.label.trim().slice(0, 80) : "";
    const sampleValue =
      typeof r.sampleValue === "string" ? r.sampleValue.trim().slice(0, 400) : "";
    if (!sampleValue) {
      return {
        error: `Variable {{${position}}} needs a sample value for Meta review.`,
      };
    }
    const source = r.source === "merge_tag" ? "merge_tag" : "manual";
    let mergeTag: string | null = null;
    if (source === "merge_tag") {
      mergeTag = typeof r.mergeTag === "string" ? r.mergeTag.trim() : "";
      if (!mergeTag || !isWhatsappMergeTag(mergeTag)) {
        return { error: `Variable {{${position}}} maps to an unknown merge tag.` };
      }
    }
    byPos.set(position, {
      position,
      label: label || `Value ${position}`,
      sampleValue,
      source,
      mergeTag,
    });
  }
  if (byPos.size !== positions.length) {
    return {
      error: `The body has ${positions.length} variable(s) but ${byPos.size} were defined.`,
    };
  }
  for (const p of positions) {
    if (!byPos.has(p)) return { error: `Missing definition for {{${p}}}.` };
  }
  return { variables: positions.map((p) => byPos.get(p)!) };
}

/** Derive a Meta-compliant template name (lowercase + underscores) from a
 *  free-text display name. */
export function toMetaTemplateName(displayName: string): string {
  const cleaned = displayName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 512);
  return cleaned || "template";
}
