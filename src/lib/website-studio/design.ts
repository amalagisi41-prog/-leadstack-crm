import type { HeroVariant } from "./templates";
import type { AgentSiteDesign } from "@/types/agent-site";

/**
 * Vibe Builder design overrides: structured tokens (colors, fonts, radius,
 * hero layout) plus a scoped custom-CSS escape hatch for anything beyond
 * them. All values are validated/sanitized here before they ever reach
 * Firestore, because the renderer this feeds (agent-site-renderer.tsx) runs
 * live inside the dashboard SPA during preview — not just on the isolated
 * public site page — so unscoped or malformed CSS could otherwise bleed
 * into the surrounding AgentStack UI.
 */

/** Stable id every custom-CSS rule is scoped under. Shared with the renderer. */
export const SITE_CANVAS_ID = "agentstack-site-canvas";

const DESIGN_COLOR_KEYS: (keyof AgentSiteDesign)[] = [
  "bg",
  "surface",
  "text",
  "muted",
  "accent",
  "accentText",
  "border",
];
const DESIGN_FONT_KEYS: (keyof AgentSiteDesign)[] = ["fontDisplay", "fontBody"];
const HERO_VARIANTS: HeroVariant[] = ["overlay", "split", "centered"];
const MAX_CUSTOM_CSS_CHARS = 20_000;
const FORBIDDEN_CSS_PATTERNS = [
  /@import/i,
  /expression\s*\(/i,
  /javascript:/i,
  /-moz-binding/i,
  /behavior\s*:/i,
];

/** Loose but safe: hex, rgb()/rgba()/hsl()/hsla(), or a few keywords. */
function isSafeColor(value: string): boolean {
  const v = value.trim();
  return (
    /^#[0-9a-f]{3,8}$/i.test(v) ||
    /^(rgb|rgba|hsl|hsla)\(\s*[\d.%,\s/]+\)$/i.test(v) ||
    ["transparent", "currentcolor", "inherit"].includes(v.toLowerCase())
  );
}

/** No braces/semicolons/angle-brackets — just a font name or stack. */
function isSafeFontValue(value: string): boolean {
  const v = value.trim();
  return v.length > 0 && v.length <= 120 && /^[A-Za-z0-9 ,'"-]+$/.test(v);
}

/**
 * Scope every selector in `css` under `#SITE_CANVAS_ID` so it can never
 * affect anything outside the rendered site — required because this CSS
 * renders live inside the dashboard during preview, not only on the public
 * page. Recurses into @media/@supports; drops @import/@charset and any
 * other unrecognized at-rule; passes @font-face/@keyframes bodies through
 * untouched (they carry no selectors of their own, so nothing to scope).
 * Hand-rolled rather than a CSS-parser dependency, consistent with the
 * regex-based approach already used in lib/website-transfer.
 */
export function scopeCustomCss(css: string, scope = `#${SITE_CANVAS_ID}`): string {
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, "");
  let i = 0;
  const n = stripped.length;
  let out = "";

  function readBlock(): string {
    // stripped[i] === '{'
    let depth = 0;
    const start = i;
    while (i < n) {
      if (stripped[i] === "{") depth++;
      else if (stripped[i] === "}") {
        depth--;
        if (depth === 0) {
          i++;
          return stripped.slice(start, i);
        }
      }
      i++;
    }
    return stripped.slice(start);
  }

  function scopeSelectorList(selectorPart: string): string {
    return selectorPart
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => {
        if (s.startsWith(scope)) return s;
        if (/^(html|:root)\b/i.test(s)) return s.replace(/^(html|:root)/i, scope);
        if (/^body\b/i.test(s)) return s.replace(/^body/i, scope);
        return `${scope} ${s}`;
      })
      .join(", ");
  }

  while (i < n) {
    while (i < n && /\s/.test(stripped[i])) i++;
    if (i >= n) break;

    if (stripped[i] === "@") {
      const start = i;
      while (i < n && stripped[i] !== "{" && stripped[i] !== ";") i++;
      const atHead = stripped.slice(start, i).trim();
      if (stripped[i] === ";") {
        i++;
        continue; // statement at-rules (@import, @charset…) — drop
      }
      if (i >= n) break; // malformed tail
      const block = readBlock();
      const inner = block.slice(1, -1);
      const lower = atHead.toLowerCase();
      if (lower.startsWith("@media") || lower.startsWith("@supports")) {
        out += `${atHead}{${scopeCustomCss(inner, scope)}}`;
      } else if (
        lower.startsWith("@font-face") ||
        lower.startsWith("@keyframes") ||
        lower.startsWith("@-webkit-keyframes")
      ) {
        out += `${atHead}{${inner}}`;
      }
      // any other at-rule: drop for safety
      continue;
    }

    const start = i;
    while (i < n && stripped[i] !== "{") i++;
    if (i >= n) break; // malformed tail — stop rather than emit a partial rule
    const selectorPart = stripped.slice(start, i).trim();
    const block = readBlock();
    const declarations = block.slice(1, -1);
    if (!selectorPart) continue;
    out += `${scopeSelectorList(selectorPart)}{${declarations}}`;
  }

  return out;
}

/** Validate + scope custom CSS. Returns "" (silently dropped) if unsafe. */
function sanitizeCustomCss(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (trimmed.length > MAX_CUSTOM_CSS_CHARS) return null;
  if (FORBIDDEN_CSS_PATTERNS.some((re) => re.test(trimmed))) return "";
  return scopeCustomCss(trimmed);
}

/**
 * Merge validated design-token updates onto the current design. Unknown
 * keys and out-of-range/malformed values are silently dropped rather than
 * rejecting the whole update — one bad field shouldn't block the rest of a
 * Vibe Builder turn.
 */
export function applyDesignFields(
  current: AgentSiteDesign,
  fields: Record<string, unknown>
): AgentSiteDesign {
  const next = { ...current };
  for (const [k, v] of Object.entries(fields)) {
    const key = k as keyof AgentSiteDesign;
    if (DESIGN_COLOR_KEYS.includes(key)) {
      if (typeof v === "string" && isSafeColor(v)) {
        (next as Record<string, unknown>)[key] = v.trim();
      }
    } else if (DESIGN_FONT_KEYS.includes(key)) {
      if (typeof v === "string" && isSafeFontValue(v)) {
        (next as Record<string, unknown>)[key] = v.trim();
      }
    } else if (key === "radius") {
      if (typeof v === "number" && Number.isFinite(v)) {
        next.radius = Math.max(0, Math.min(48, Math.round(v)));
      }
    } else if (key === "heroVariant") {
      if (typeof v === "string" && HERO_VARIANTS.includes(v as HeroVariant)) {
        next.heroVariant = v as HeroVariant;
      }
    } else if (key === "customCss") {
      const sanitized = sanitizeCustomCss(v);
      if (sanitized !== null) next.customCss = sanitized;
    }
  }
  return next;
}
