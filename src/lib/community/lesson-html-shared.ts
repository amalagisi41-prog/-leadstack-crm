/**
 * Client-safe lesson-body helpers — NO sanitizer dependency, so importing this
 * from a client component (the rich-text editor) never pulls DOMPurify/jsdom
 * into the browser bundle. The sanitizing render path lives in lesson-html.ts.
 *
 * Legacy bodies created before rich text were stored as PLAIN TEXT in the same
 * `bodyHtml` field; {@link lessonBodyToEditorHtml} upgrades those to paragraphs
 * so newlines survive.
 */

/** True when the string already contains HTML markup (vs. legacy plain text). */
export function isHtml(s: string): boolean {
  return /<[a-z][\s\S]*>/i.test(s);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Convert legacy plain-text bodies into paragraph HTML (preserving newlines). */
export function plainTextToHtml(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  return trimmed
    .split(/\n{2,}/)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

/**
 * Normalize a stored body into editor-ready HTML — passes real HTML through and
 * upgrades legacy plain text to paragraphs. NOT sanitized (the editor is staff
 * authoring their own content); the player sanitizes on render.
 */
export function lessonBodyToEditorHtml(body: string | null | undefined): string {
  const s = (body ?? "").trim();
  if (!s) return "";
  return isHtml(s) ? s : plainTextToHtml(s);
}
