import {
  DESIGN_TOKEN_KEYS,
  MAX_CUSTOM_CSS_CHARS,
  findForbiddenCssPatterns,
} from "./design";

/**
 * Ingesting design work an agent produced somewhere else.
 *
 * Agents take a design problem to Claude or ChatGPT, get back a block of CSS
 * or a JSON palette, and paste the result into Zack. Two things used to make
 * that fail quietly. The composer truncated the paste at 1500 characters, and
 * whatever survived still had to travel back out through the model's own JSON
 * response — so a 6KB stylesheet returned mangled, or simply stopped at the
 * completion-token limit.
 *
 * Pulling the code out here fixes both: it is applied byte-for-byte by the
 * same validator that guards Zack's own output, and the model only ever has
 * to talk *about* it. What the model sees in place of each block is a short
 * placeholder, which is also what gets stored in the transcript — a site
 * document that accumulated 40 turns of pasted stylesheets would otherwise
 * approach Firestore's 1MB per-document ceiling.
 */

/** Preprocessor and template languages we deliberately do not compile. */
const UNSUPPORTED_LANGUAGES = new Set([
  "html",
  "htm",
  "xml",
  "svg",
  "js",
  "jsx",
  "ts",
  "tsx",
  "javascript",
  "typescript",
  "vue",
  "svelte",
  "php",
  "python",
  "scss",
  "sass",
  "less",
  "stylus",
]);

const CSS_LANGUAGES = new Set(["css", "postcss", "text/css"]);
const JSON_LANGUAGES = new Set(["json", "json5", "jsonc"]);

/** A fenced block: ```lang\n...\n``` */
const FENCE_RE = /```([A-Za-z0-9+#/_-]*)[ \t]*\r?\n([\s\S]*?)```/g;

/** At least one `selector { prop: value }` rule. */
const CSS_RULE_RE = /[^{}]+\{[^{}]*[a-zA-Z-]+\s*:\s*[^{}]+\}/;

export interface UnsupportedBlock {
  language: string;
  lines: number;
}

export interface ExtractedExternalCode {
  /** CSS to apply verbatim, concatenated across blocks. */
  css: string;
  /** Design tokens lifted from a pasted JSON palette. */
  designTokens: Record<string, unknown>;
  /** Blocks in languages this site cannot accept. */
  unsupported: UnsupportedBlock[];
  /** The message with each code block swapped for a short placeholder. */
  prose: string;
  /** Disallowed CSS constructs that stopped the paste being applied. */
  rejectedCss: string[];
  /** True when the paste exceeded the custom-CSS ceiling. */
  tooLarge: boolean;
  hasCode: boolean;
}

/** Rough rule count — good enough to describe a paste, not to validate it. */
export function countCssRules(css: string): number {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
  return (withoutComments.match(/\{/g) ?? []).length;
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(text.trim());
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/**
 * CSS-shaped rather than prose or JSON. Deliberately strict: a message like
 * "make the hero blue" must not be mistaken for a stylesheet, because a false
 * positive would push raw English through the CSS scoper.
 */
export function looksLikeCss(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (parseJsonObject(trimmed)) return false;
  if (!CSS_RULE_RE.test(trimmed)) return false;
  const opens = (trimmed.match(/\{/g) ?? []).length;
  const closes = (trimmed.match(/\}/g) ?? []).length;
  return opens > 0 && opens === closes;
}

/** Split a pasted JSON object into recognized design tokens and the rest. */
function splitDesignTokens(source: Record<string, unknown>): {
  tokens: Record<string, unknown>;
  otherKeys: string[];
} {
  const tokens: Record<string, unknown> = {};
  const otherKeys: string[] = [];
  for (const [key, value] of Object.entries(source)) {
    if ((DESIGN_TOKEN_KEYS as readonly string[]).includes(key)) {
      tokens[key] = value;
    } else {
      otherKeys.push(key);
    }
  }
  return { tokens, otherKeys };
}

/**
 * Pull applyable code out of a pasted message.
 *
 * Handles fenced blocks (tagged or not) and a bare paste with no fences at
 * all, which is what a "copy the CSS" button usually produces.
 */
export function extractExternalCode(message: string): ExtractedExternalCode {
  const cssParts: string[] = [];
  let designTokens: Record<string, unknown> = {};
  const unsupported: UnsupportedBlock[] = [];
  let fenceCount = 0;

  const replaced = message
    .replace(FENCE_RE, (_match, rawLang: string, rawCode: string) => {
      fenceCount += 1;
      const language = (rawLang || "").trim().toLowerCase();
      const code = rawCode.trim();
      if (!code) return "";
      const lines = code.split("\n").length;

      if (UNSUPPORTED_LANGUAGES.has(language)) {
        unsupported.push({ language, lines });
        return `[${language} block, ${lines} lines — not applied]`;
      }

      if (JSON_LANGUAGES.has(language)) {
        const parsed = parseJsonObject(code);
        if (parsed) {
          const { tokens, otherKeys } = splitDesignTokens(parsed);
          designTokens = { ...designTokens, ...tokens };
          const applied = Object.keys(tokens);
          // Non-token keys stay in the prose verbatim so the model can still
          // act on them (they are usually content fields, which have to go
          // through the compliance screen rather than around it).
          return otherKeys.length > 0
            ? `[design tokens applied: ${applied.join(", ") || "none"}] remaining JSON: ${JSON.stringify(
                Object.fromEntries(otherKeys.map((k) => [k, parsed[k]]))
              )}`
            : `[design tokens applied: ${applied.join(", ") || "none"}]`;
        }
        return `[unparseable JSON block, ${lines} lines — not applied]`;
      }

      if (CSS_LANGUAGES.has(language)) {
        cssParts.push(code);
        return `[css block applied verbatim: ${countCssRules(code)} rules]`;
      }

      // Untagged fence: work out what it actually is.
      if (!language) {
        const parsed = parseJsonObject(code);
        if (parsed) {
          const { tokens, otherKeys } = splitDesignTokens(parsed);
          if (Object.keys(tokens).length > 0) {
            designTokens = { ...designTokens, ...tokens };
            return `[design tokens applied: ${Object.keys(tokens).join(", ")}]${
              otherKeys.length > 0 ? ` remaining keys: ${otherKeys.join(", ")}` : ""
            }`;
          }
          return code;
        }
        if (looksLikeCss(code)) {
          cssParts.push(code);
          return `[css block applied verbatim: ${countCssRules(code)} rules]`;
        }
        return code;
      }

      unsupported.push({ language, lines });
      return `[${language} block, ${lines} lines — not applied]`;
    })
    .trim();

  let prose = replaced;

  // A paste with no fences at all — the whole message is the stylesheet or
  // the palette. Only reachable when nothing was fenced, otherwise a message
  // whose single block was rejected (SCSS, HTML) would be swept up here a
  // second time, backticks and all, and pushed through the CSS scoper.
  if (fenceCount === 0) {
    const parsedWhole = parseJsonObject(message);
    if (parsedWhole) {
      const { tokens } = splitDesignTokens(parsedWhole);
      if (Object.keys(tokens).length > 0) {
        designTokens = tokens;
        prose = "Apply these design tokens to my site.";
      }
    } else if (looksLikeCss(message)) {
      cssParts.push(message.trim());
      prose = "Apply this stylesheet to my site.";
    }
  }

  const rawCss = cssParts.join("\n\n").trim();
  const rejectedCss = rawCss ? findForbiddenCssPatterns(rawCss) : [];
  const tooLarge = rawCss.length > MAX_CUSTOM_CSS_CHARS;

  return {
    css: rejectedCss.length > 0 || tooLarge ? "" : rawCss,
    designTokens,
    unsupported,
    prose,
    rejectedCss,
    tooLarge,
    hasCode:
      cssParts.length > 0 ||
      Object.keys(designTokens).length > 0 ||
      unsupported.length > 0,
  };
}

/**
 * Append incoming CSS after existing CSS so the later rules win on cascade.
 * Both sides are re-scoped downstream, which is idempotent for CSS that has
 * already been scoped once.
 */
export function mergeCustomCss(existing: string, incoming: string): string {
  const base = (existing ?? "").trim();
  const next = (incoming ?? "").trim();
  if (!next) return base;
  if (!base) return next;
  if (base.includes(next)) return base;
  return `${base}\n${next}`;
}

/**
 * What the model is told about the paste. It gets the shape and the rule
 * count, never the bytes — the whole point is that it does not have to
 * reproduce them.
 */
export function summarizeExternalCode(
  extracted: ExtractedExternalCode
): string {
  if (!extracted.hasCode) return "";
  const lines: string[] = [];
  if (extracted.css) {
    lines.push(
      `- ${countCssRules(extracted.css)} CSS rules from the user's paste have ALREADY been applied verbatim to customCss. Do not repeat them back in your "design" field — only put NEW css there, and it will be appended.`
    );
  }
  if (extracted.rejectedCss.length > 0) {
    lines.push(
      `- The pasted CSS was REJECTED because it contains ${extracted.rejectedCss.join(", ")}. Tell the user which construct is not allowed and offer a safe equivalent.`
    );
  }
  if (extracted.tooLarge) {
    lines.push(
      `- The pasted CSS is over the ${MAX_CUSTOM_CSS_CHARS.toLocaleString()}-character limit and was not applied. Ask the user for the specific sections they care about.`
    );
  }
  const tokenKeys = Object.keys(extracted.designTokens);
  if (tokenKeys.length > 0) {
    lines.push(
      `- Design tokens from the user's paste have ALREADY been applied: ${tokenKeys.join(", ")}. Confirm them, don't re-send them.`
    );
  }
  if (extracted.unsupported.length > 0) {
    const kinds = [
      ...new Set(extracted.unsupported.map((block) => block.language)),
    ].join(", ");
    lines.push(
      `- The user pasted ${kinds} which this site cannot execute (the page is rendered from a fixed template — no arbitrary markup or scripts). Do NOT claim you applied it. Say plainly what cannot be used, then translate the intent into the design tokens, customCss, and content fields you do control, and do that work in this same turn.`
    );
  }
  return lines.length > 0
    ? `\nEXTERNAL CODE THE USER PASTED (already processed before you saw it):\n${lines.join("\n")}\n`
    : "";
}

/** A short, factual note appended to Zack's reply so the UI never overstates. */
export function describeExternalCode(
  extracted: ExtractedExternalCode
): string {
  const notes: string[] = [];
  if (extracted.css) {
    notes.push(
      `Applied ${countCssRules(extracted.css)} pasted CSS rules to your site's custom stylesheet.`
    );
  }
  if (extracted.rejectedCss.length > 0) {
    notes.push(
      `Your pasted CSS was not applied because it uses ${extracted.rejectedCss.join(", ")}, which isn't allowed on a hosted site.`
    );
  }
  if (extracted.tooLarge) {
    notes.push(
      `Your pasted CSS is over the ${MAX_CUSTOM_CSS_CHARS.toLocaleString()}-character limit, so nothing was applied.`
    );
  }
  const tokenKeys = Object.keys(extracted.designTokens);
  if (tokenKeys.length > 0) {
    notes.push(`Applied pasted design tokens: ${tokenKeys.join(", ")}.`);
  }
  if (extracted.unsupported.length > 0) {
    const kinds = [
      ...new Set(extracted.unsupported.map((block) => block.language)),
    ].join(", ");
    notes.push(
      `The ${kinds} you pasted can't run on this site — it renders from a fixed template, so only styling and copy can change.`
    );
  }
  return notes.length > 0 ? `\n\n_${notes.join(" ")}_` : "";
}

/**
 * What to keep in the stored transcript. The prose plus placeholders, never
 * the raw blocks, so 40 turns of pasted stylesheets can't grow the site
 * document toward Firestore's per-document limit.
 */
export function transcriptTextFor(
  message: string,
  extracted: ExtractedExternalCode
): string {
  if (!extracted.hasCode) return message;
  const summary = [
    extracted.css ? `${countCssRules(extracted.css)} CSS rules` : null,
    Object.keys(extracted.designTokens).length > 0
      ? `${Object.keys(extracted.designTokens).length} design tokens`
      : null,
  ]
    .filter(Boolean)
    .join(" + ");
  const marker = summary ? ` 📋 [pasted ${summary}]` : "";
  return `${extracted.prose}${marker}`.trim().slice(0, 2000);
}
