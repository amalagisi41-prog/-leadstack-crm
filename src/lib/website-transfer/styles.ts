import "server-only";

const MAX_STYLESHEETS = 16;
const MAX_STYLESHEET_CHARS = 350_000;
const MAX_INLINE_CSS_CHARS = 1_200_000;

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function rewriteCssUrls(css: string, stylesheetUrl: URL): string {
  return css.replace(
    /url\(\s*(["']?)(?!data:|https?:|\/\/|#)([^"')]+)\1\s*\)/gi,
    (_match, _quote: string, value: string) => {
      try {
        return `url("${new URL(value.trim(), stylesheetUrl).toString()}")`;
      } catch {
        return `url("${value}")`;
      }
    }
  );
}

export function extractStylesheetUrls(html: string, base: URL): string[] {
  const values: string[] = [];
  const linkPattern = /<link\b[^>]*>/gi;
  for (const match of html.matchAll(linkPattern)) {
    const tag = match[0];
    const rel = tag.match(/\brel\s*=\s*["']([^"']+)["']/i)?.[1] ?? "";
    const href = tag.match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1];
    if (!href || !/\bstylesheet\b/i.test(decodeHtml(rel))) continue;
    try {
      const url = new URL(decodeHtml(href), base);
      if (/^https?:$/.test(url.protocol)) values.push(url.toString());
    } catch {
      // Ignore malformed third-party links; they should not block the preview.
    }
  }
  return [...new Set(values)].slice(0, MAX_STYLESHEETS);
}

async function fetchStylesheet(url: string): Promise<string> {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(10_000),
      headers: {
        Accept: "text/css,*/*;q=0.1",
        "User-Agent":
          "AgentStack-Site-Transfer/1.0 (+https://agentstackcrm.app)",
      },
    });
    if (!response.ok) return "";
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("css") && !/\.css(?:[?#]|$)/i.test(url))
      return "";
    const text = (await response.text()).slice(0, MAX_STYLESHEET_CHARS);
    return rewriteCssUrls(text, new URL(response.url || url));
  } catch {
    return "";
  }
}

export async function inlineStylesheetAssets(urls: string[]): Promise<string> {
  const styles = await Promise.all(
    [...new Set(urls)].slice(0, MAX_STYLESHEETS).map(fetchStylesheet)
  );
  return styles.join("\n").slice(0, MAX_INLINE_CSS_CHARS);
}
