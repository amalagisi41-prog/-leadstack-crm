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

/** Remove origin CSP metadata before serving a captured page on AgentStack. */
export function removeCapturedCsp(html: string): string {
  return html.replace(
    /<meta\b[^>]*(?:http-equiv\s*=\s*["']?content-security-policy(?:-report-only)?["']?|content\s*=\s*["'][^"']*content-security-policy[^"']*["'][^>]*)[^>]*>/gi,
    ""
  );
}

/**
 * Captured pages sometimes mark their stylesheet links as CORS resources.
 * That is valid on the source origin, but causes Safari to discard the CSS
 * when the isolated preview is hosted on AgentStack. Keep the stylesheet
 * links, while removing the opt-in CORS attribute from the preview copy.
 */
export function normalizeCapturedStylesheetLinks(
  html: string,
  stylesheetUrls: string[]
): string {
  const normalized = html.replace(
    /<link\b[^>]*>/gi,
    (tag) => {
      if (!/\brel\s*=\s*["'][^"']*\bstylesheet\b[^"']*["']/i.test(tag))
        return tag;
      return tag.replace(/\s+crossorigin(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?/gi, "");
    }
  );
  const existing = new Set(
    [...normalized.matchAll(/<link\b[^>]*\brel\s*=\s*["'][^"']*\bstylesheet\b[^"']*["'][^>]*>/gi)]
      .map((match) => match[0].match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1])
      .filter((href): href is string => Boolean(href))
  );
  const missing = [...new Set(stylesheetUrls)].filter((href) => !existing.has(href));
  if (!missing.length) return normalized;
  const links = missing
    .map(
      (href) =>
        `<link rel="stylesheet" href="${href.replace(/&/g, "&amp;").replace(/"/g, "&quot;")}">`
    )
    .join("");
  return /<head[^>]*>/i.test(normalized)
    ? normalized.replace(/<head([^>]*)>/i, `<head$1>${links}`)
    : links + normalized;
}

/** Add a semantic layout layer when a React capture is pre-hydration. */
export function classlessSnapshotStyles(html: string): string {
  const mainStart = html.search(/<main\b/i);
  const listingsStart = html.search(/data-ahn-home-listings/i);
  const structuralEnd = listingsStart > mainStart && listingsStart > 0
    ? listingsStart
    : Math.min(html.length, (mainStart > 0 ? mainStart : 0) + 24_000);
  const head = html.slice(0, structuralEnd);
  if (!/<header\b[^>]*>\s*<a\b/i.test(head)) return "";
  if ((head.match(/\bclass\s*=/gi) ?? []).length > 10) return "";
  return `html,body{margin:0;min-width:0;max-width:100%;overflow-x:hidden;background:#fff;color:#18303a;font-family:Manrope,Arial,sans-serif}body{line-height:1.45}main{width:100%;margin:0;padding:0}main>div>div>header{position:absolute;inset:0 0 auto;z-index:20;padding:24px clamp(20px,5vw,80px);color:#fff}main>div>div>header>a:first-child{position:absolute;left:-9999px}main>div>div>header nav{display:flex;align-items:center;justify-content:space-between;gap:24px;width:100%;max-width:1440px;margin:0 auto}main>div>div>header nav>a:first-child img{display:block;width:min(190px,22vw);height:auto}main>div>div>header nav>div{display:flex;align-items:center;gap:6px}main>div>div>header nav>div:first-of-type{padding:10px 18px;border:1px solid rgba(255,255,255,.08);border-radius:999px;background:rgba(11,31,42,.72);backdrop-filter:blur(12px)}main>div>div>header nav a{color:inherit;text-decoration:none}main>div>div>header nav>div:first-of-type a{padding:8px 12px;font-size:15px;font-weight:600;white-space:nowrap}main>div>div>header nav>div:nth-of-type(2){gap:10px}main>div>div>header nav>div:nth-of-type(2) a{padding:12px 20px;border-radius:999px;font-weight:700;white-space:nowrap}main>div>div>header nav>div:nth-of-type(2) a:last-child{background:#d4ad42;color:#102330}main>div>div>section:first-of-type{position:relative;display:flex;flex-direction:column;justify-content:center;min-height:720px;overflow:hidden;padding:150px 20px 90px;text-align:center;color:#fff;background:#0b1f2a}main>div>div>section:first-of-type>div:first-child{position:absolute;inset:0;z-index:0}main>div>div>section:first-of-type img[alt*="drone"]{display:block;width:100%;height:100%;object-fit:cover;opacity:.78}main>div>div>section:first-of-type>div:nth-child(2){position:relative;z-index:2;display:flex;flex-direction:column;align-items:center;gap:18px}main>div>div>section:first-of-type h1{max-width:1000px;margin:0;color:#fff;font-size:clamp(42px,6vw,88px);font-weight:800;line-height:.98;letter-spacing:-.04em;text-shadow:0 3px 18px rgba(0,0,0,.35)}main>div>div>section:first-of-type h1 span{white-space:pre-line}main>div>div>section:first-of-type h1+div{font-size:clamp(16px,2vw,24px);font-weight:700}main>div>div>section:first-of-type form{display:flex;width:min(800px,92vw);margin-top:12px;background:#fff;border-radius:8px;overflow:hidden}main>div>div>section:first-of-type form input{flex:1;min-width:0;border:0;padding:20px;font-size:16px;color:#18303a}main>div>div>section:first-of-type form button{width:76px;border:0;background:#0b2944}main>div>div>section:first-of-type a{text-decoration:none}main>div>div>section:first-of-type>div:nth-child(3) a{display:inline-block;padding:16px 32px;background:#0b2944;color:#fff;font-weight:800;letter-spacing:.04em}main>div>div>section:first-of-type p{margin:0;color:rgba(255,255,255,.75)}main>div>div>section[data-ahn-home-listings]{padding:14px 0 24px;background:#fff}main>div>div>section[data-ahn-home-listings]>div:first-child{text-align:center;color:#d4ad42;font-weight:800;letter-spacing:.2em}@media(max-width:767px){main>div>div>header{padding:16px 18px}main>div>div>header nav>div:first-of-type{display:none}main>div>div>header nav>div:nth-of-type(2) a:first-child{display:none}main>div>div>section:first-of-type{min-height:680px;padding-top:130px}main>div>div>section:first-of-type h1{font-size:42px}}`;
}

/** Correct selectors for captures whose hero section is nested inside header. */
export function classlessSemanticLayoutStyles(): string {
  return `main>div>div>header{position:relative;display:block;padding:0;background:#0b1f2a;color:#fff}main>div>div>header>nav{position:absolute;top:0;left:0;right:0;z-index:20;padding:24px clamp(20px,5vw,80px)}main>div>div>header>section:first-of-type{position:relative;display:flex;flex-direction:column;justify-content:center;min-height:720px;overflow:hidden;padding:150px 20px 90px;text-align:center;color:#fff;background:#0b1f2a}main>div>div>header>section:first-of-type>div:first-child{position:absolute;inset:0;z-index:0}main>div>div>header>section:first-of-type img[alt*="drone"]{display:block;width:100%;height:100%;object-fit:cover;opacity:.78}main>div>div>header>section:first-of-type>div:nth-child(2){position:relative;z-index:2;display:flex;flex-direction:column;align-items:center;gap:18px}main>div>div>header>section:first-of-type h1{max-width:1000px;margin:0;color:#fff;font-size:clamp(42px,6vw,88px);font-weight:800;line-height:.98;letter-spacing:-.04em;text-shadow:0 3px 18px rgba(0,0,0,.35)}main>div>div>header>section:first-of-type h1 span{white-space:pre-line}main>div>div>header>section:first-of-type h1+div{font-size:clamp(16px,2vw,24px);font-weight:700}main>div>div>header>section:first-of-type form{display:flex;width:min(800px,92vw);margin-top:12px;background:#fff;border-radius:8px;overflow:hidden}main>div>div>header>section:first-of-type form input{flex:1;min-width:0;border:0;padding:20px;font-size:16px;color:#18303a}main>div>div>header>section:first-of-type form button{width:76px;border:0;background:#0b2944}main>div>div>header>section:first-of-type>div:nth-child(3) a{display:inline-block;padding:16px 32px;background:#0b2944;color:#fff;font-weight:800;letter-spacing:.04em;text-decoration:none}main>div>div>header>section>section[data-ahn-home-listings]{padding:14px 0 24px;background:#fff}main>div>div>header>section>section[data-ahn-home-listings]>div:first-child{text-align:center;color:#d4ad42;font-weight:800;letter-spacing:.2em}@media(max-width:767px){main>div>div>header>section:first-of-type{min-height:680px;padding-top:130px}main>div>div>header>section:first-of-type h1{font-size:42px}}`;
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
