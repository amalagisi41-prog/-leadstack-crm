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
 * Some captured pages contain the contents of a custom CSS field as a plain
 * text node inside the widget markup instead of inside a <style> element.
 * Leaving that node in the isolated replacement makes the CSS appear as a
 * huge paragraph above the page. The replacement route injects the same CSS
 * safely into <head>, so remove only the leaked widget text and preserve the
 * surrounding markup.
 */
export function removeCapturedStyleText(html: string): string {
  const styleBlocks: string[] = [];
  const stylePlaceholder = "\u0000AGENTSTACK_STYLE_BLOCK_";
  const withoutStyles = html.replace(/<style\b[\s\S]*?<\/style\s*>/gi, (block) => {
    styleBlocks.push(block);
    return `${stylePlaceholder}${styleBlocks.length - 1}\u0000`;
  });
  const cleaned = withoutStyles.replace(
    /\/\*\s*IDX\s+Carousel\s+Widget\b[\s\S]*?(?=<\/?(?:div|idx-listings-carousel|section|main|body)\b|$)/gi,
    ""
  );
  return cleaned.replace(
    new RegExp(`${stylePlaceholder}(\\d+)\\u0000`, "g"),
    (_match, index: string) => styleBlocks[Number(index)] ?? ""
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
  stylesheetUrls: string[],
  base?: URL | null
): string {
  const normalized = html.replace(
    /<link\b[^>]*>/gi,
    (tag) => {
      if (!/\brel\s*=\s*["'][^"']*\bstylesheet\b[^"']*["']/i.test(tag))
        return tag;
      const withoutCors = tag.replace(
        /\s+crossorigin(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?/gi,
        ""
      ).replace(
        /\s+(?:integrity|nonce)(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?/gi,
        ""
      );
      if (!base) return withoutCors;
      const href = withoutCors.match(/\bhref\s*=\s*(["'])(.*?)\1/i);
      if (!href?.[2]) return withoutCors;
      try {
        const absoluteHref = new URL(decodeHtml(href[2]), base).toString();
        return withoutCors.replace(
          href[0],
          `href="${absoluteHref.replace(/&/g, "&amp;").replace(/"/g, "&quot;")}"`
        );
      } catch {
        return withoutCors;
      }
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
  return `main>div>div>header{position:relative;display:block;padding:0;background:#0b1f2a;color:#fff}main>div>div>header>nav{position:absolute;top:0;left:0;right:0;z-index:20;padding:24px clamp(20px,5vw,80px)}main>div>div>header>section:first-of-type{position:relative;display:flex;flex-direction:column;justify-content:center;min-height:720px;overflow:hidden;padding:150px 20px 90px;text-align:center;color:#fff;background:#0b1f2a}main>div>div>header>section:first-of-type>div:first-child{position:absolute;inset:0;z-index:0}main>div>div>header>section:first-of-type img[alt*="drone"]{display:block;width:100%;height:100%;object-fit:cover;opacity:.78}main>div>div>header>section:first-of-type>div:nth-child(2){position:relative;z-index:2;display:flex;flex-direction:column;align-items:center;gap:18px}main>div>div>header>section:first-of-type h1{max-width:1000px;margin:0;color:#fff;font-size:clamp(42px,6vw,88px);font-weight:800;line-height:.98;letter-spacing:-.04em;text-shadow:0 3px 18px rgba(0,0,0,.35)}main>div>div>header>section:first-of-type h1 span{white-space:pre-line}main>div>div>header>section:first-of-type h1+div{font-size:clamp(16px,2vw,24px);font-weight:700}main>div>div>header>section:first-of-type form{display:flex;width:min(800px,92vw);margin-top:12px;background:#fff;border-radius:8px;overflow:hidden}main>div>div>header>section:first-of-type form input{flex:1;min-width:0;border:0;padding:20px;font-size:16px;color:#18303a}main>div>div>header>section:first-of-type form button{width:76px;border:0;background:#0b2944}main>div>div>header>section:first-of-type>div:nth-child(3) a{display:inline-block;padding:16px 32px;background:#0b2944;color:#fff;font-weight:800;letter-spacing:.04em;text-decoration:none}main>div>div>header>section>section[data-ahn-home-listings]{padding:14px 0 24px;background:#fff}main>div>div>header>section>section[data-ahn-home-listings]>div:first-child{text-align:center;color:#d4ad42;font-weight:800;letter-spacing:.2em}
main>div>div>section:not([data-ahn-home-listings]){display:block!important;opacity:1!important;transform:none!important;padding:72px clamp(20px,6vw,96px);background:#fff;color:#18303a;font-family:Manrope,Arial,sans-serif}
main>div>div>section:not([data-ahn-home-listings])>div{width:100%;max-width:1200px;margin:0 auto}
main>div>div>section:not([data-ahn-home-listings]) h2{margin:8px 0 18px;color:#102d3a;font-family:Sora,Manrope,Arial,sans-serif;font-size:clamp(28px,4vw,52px);line-height:1.05;letter-spacing:-.03em}
main>div>div>section:not([data-ahn-home-listings]) h3{margin:0 0 8px;color:#102d3a;font-family:Sora,Manrope,Arial,sans-serif;font-size:18px;line-height:1.2}
main>div>div>section:not([data-ahn-home-listings]) p{margin:0 0 14px;color:#526875;font-size:16px;line-height:1.65}
main>div>div>section:not([data-ahn-home-listings])>div>div:first-child>span,main>div>div>section:not([data-ahn-home-listings])>div>span{display:block;color:#c39b35;font-size:12px;font-weight:800;letter-spacing:.2em;text-transform:uppercase}
main>div>div>section#connect{background:#eef3f4;color:#18303a}
main>div>div>section#connect>div>div{display:grid;grid-template-columns:minmax(0,1fr) minmax(320px,520px);gap:56px;align-items:start}
main>div>div>section#connect form{display:grid;gap:14px;padding:28px;border-radius:12px;background:#fff;box-shadow:0 10px 30px rgba(16,45,58,.12)}
main>div>div>section#connect form>div{display:grid;gap:6px}
main>div>div>section#connect label{color:#526875;font-size:13px;font-weight:700}
main>div>div>section#connect input,main>div>div>section#connect select{width:100%;min-height:44px;padding:10px 12px;border:1px solid #cbd8dc;border-radius:6px;background:#fff;color:#18303a;box-sizing:border-box}
main>div>div>section#connect form>button{min-height:48px;border:0;border-radius:6px;background:#0b2944;color:#fff;font-weight:800;letter-spacing:.02em}
main>div>div>section#connect a,main>div>div>section:not([data-ahn-home-listings]) a{color:#0b5c78;font-weight:700;text-decoration:none}
main>div>div>section#connect>div>div>div:first-child{padding-top:12px}
main>div>div>section#why-artisan>div>div{display:grid;grid-template-columns:minmax(220px,.75fr) minmax(0,1.25fr);gap:64px;align-items:start}
main>div>div>section#how-it-works>div>div:nth-child(2){display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px;margin-top:32px}
main>div>div>section#how-it-works>div>div:nth-child(2)>div{padding:20px;border-top:2px solid #d4ad42;background:#f7f9f9}
main>div>div>section#how-it-works>div>div:nth-child(2)>div>div{color:#c39b35;font-size:24px;font-weight:800}
main>div>div>section#how-it-works>div>div:last-child{margin-top:28px}
main>div>div>footer{display:block!important;padding:64px clamp(20px,6vw,96px) 28px;background:#0b1f2a;color:rgba(255,255,255,.78);font-family:Manrope,Arial,sans-serif}
main>div>div>footer a{color:#fff;text-decoration:none}
main>div>div>footer>div{width:100%;max-width:1200px;margin:0 auto}
main>div>div>footer>div>div:first-child{display:grid;grid-template-columns:minmax(240px,1.5fr) repeat(2,minmax(150px,1fr));gap:48px;padding-bottom:42px}
main>div>div>footer>div>div:first-child>div:first-child{display:grid;gap:8px;align-content:start}
main>div>div>footer img[alt="Artisan Home Network Logo"]{display:block;width:190px;height:auto;margin-bottom:10px}
main>div>div>footer img[alt="Marr & Caruso Realty Group"]{display:block;width:160px;height:auto;margin-top:8px;border-radius:4px}
main>div>div>footer img[alt="Equal Housing Opportunity"],main>div>div>footer img[alt="REALTOR®"]{display:inline-block;width:auto;height:34px;margin:18px 10px 0 0;object-fit:contain}
main>div>div>footer>div>div:first-child>div:nth-child(2)>div:first-child,main>div>div>footer>div>div:first-child>div:nth-child(3)>div:first-child{margin-bottom:14px;color:#d4ad42;font-size:12px;font-weight:800;letter-spacing:.18em;text-transform:uppercase}
main>div>div>footer>div>div:first-child>div:nth-child(2)>div:last-child,main>div>div>footer>div>div:first-child>div:nth-child(3)>div:last-child{display:grid;gap:10px}
main>div>div>footer>div>div:last-child{padding-top:22px;border-top:1px solid rgba(255,255,255,.16);font-size:12px;line-height:1.55}
main>div>div>footer>div>div:last-child p{margin:0 0 8px;color:rgba(255,255,255,.62);font-size:12px}
main>div>div>footer+div{position:fixed;left:0;right:0;bottom:0;z-index:900;display:flex;justify-content:center;padding:16px 20px;background:#fff;color:#526875;box-shadow:0 -6px 18px rgba(16,45,58,.12);font-size:13px}
main>div>div>footer+div>div{display:flex;align-items:center;justify-content:space-between;gap:24px;width:min(1200px,100%)}
main>div>div>footer+div button{min-height:38px;padding:8px 16px;border:1px solid #cbd8dc;border-radius:6px;background:#fff;color:#18303a}
@media(max-width:767px){main>div>div>header>section:first-of-type{min-height:680px;padding-top:130px}main>div>div>header>section:first-of-type h1{font-size:42px}main>div>div>section:not([data-ahn-home-listings]){padding:52px 20px}main>div>div>section#connect>div>div,main>div>div>section#why-artisan>div>div{grid-template-columns:1fr;gap:28px}main>div>div>section#how-it-works>div>div:nth-child(2){grid-template-columns:1fr 1fr}main>div>div>footer>div>div:first-child{grid-template-columns:1fr;gap:28px}main>div>div>footer+div{padding:12px 16px}main>div>div>footer+div>div{align-items:flex-start;flex-direction:column;gap:12px}}`;
}

/** Keep captured contact controls, chat, and IDX cards usable without their source scripts. */
export function classlessEmbeddedWidgetStyles(): string {
  return `
main>div>div>header>nav>div:nth-of-type(2) a:first-child{border:1px solid rgba(255,255,255,.25);background:rgba(11,31,42,.48);color:#fff}
main>div>div>header>nav>div:nth-of-type(3){display:none}
main>div>div>header>nav>div:nth-of-type(3) a[aria-label="Call us"],main>div>div>header>nav>div:nth-of-type(3) button[aria-label="Open menu"]{align-items:center;justify-content:center;width:42px;height:42px;padding:0;border:1px solid rgba(255,255,255,.35);border-radius:999px;background:rgba(11,31,42,.72);color:#fff;text-decoration:none;box-sizing:border-box}
main>div>div>header>nav>div:nth-of-type(3) a[aria-label="Call us"]::before{content:"☎";font-size:17px;line-height:1}
main>div>div>header>nav>div:nth-of-type(3) button[aria-label="Open menu"]::before{content:"☰";font-size:20px;line-height:1}

chat-widget{display:block!important;position:fixed!important;right:20px!important;bottom:20px!important;z-index:1000!important;width:auto!important;height:auto!important;pointer-events:none}
chat-widget>div{display:block!important}
chat-widget .lc_text-widget{display:block!important;position:relative!important;right:auto!important;bottom:auto!important;width:min(360px,calc(100vw - 40px));font-family:inherit;pointer-events:auto}
chat-widget .lc_text-widget--prompt{display:flex!important;align-items:center;gap:10px;min-height:56px;padding:12px 14px;border:1px solid rgba(20,40,52,.14);border-radius:16px;background:#fff;box-shadow:0 10px 28px rgba(15,35,48,.2);box-sizing:border-box}
chat-widget .lc_text-widget_prompt--msg-bubble{display:flex!important;align-items:center;gap:10px;min-width:0;color:#18303a;font-size:14px;line-height:1.3}
chat-widget .lc_text-widget_prompt--avatar{display:block!important;flex:0 0 40px;width:40px;height:40px;border-radius:50%;object-fit:cover}
chat-widget .lc_text-widget_prompt--prompt-text{display:block!important;flex:1;min-width:0}
chat-widget .lc_text-widget_prompt--prompt-close{display:flex!important;align-items:center;justify-content:center;flex:0 0 26px;width:26px;height:26px;padding:0;border:0;border-radius:50%;background:#eff3f5;color:#18303a}
chat-widget .lc_text-widget_prompt--prompt-close svg{width:14px!important;height:14px!important;fill:#18303a!important}

main>div>div>header>section>section[data-ahn-home-listings]{contain:layout paint;overflow:hidden}
main>div>div>header>section>section[data-ahn-home-listings]>div:nth-child(2),main>div>div>header>section>section[data-ahn-home-listings]>div:nth-child(2)>div{width:100%;max-width:100%;min-width:0;box-sizing:border-box}
idx-listings-carousel{display:block!important;width:100%;max-width:100%;min-width:0;overflow:hidden;box-sizing:border-box}
idx-listings-carousel .idx-listings-carousel{display:block!important;width:100%;max-width:100%;min-width:0;box-sizing:border-box}
idx-listings-carousel .idx-listings-carousel__properties{display:flex!important;flex-wrap:nowrap!important;align-items:stretch;width:100%;max-width:100%;padding:16px clamp(16px,5vw,80px);gap:12px;overflow-x:auto;overflow-y:hidden;scroll-behavior:smooth;scroll-snap-type:x proximity;scrollbar-width:none;box-sizing:border-box}
idx-listings-carousel .idx-listings-carousel__properties::-webkit-scrollbar{display:none}
idx-listings-carousel .idx-listings-carousel__property{display:block!important;position:relative!important;flex:0 0 220px!important;width:220px!important;min-width:220px!important;max-width:220px!important;box-sizing:border-box;overflow:hidden;border:1px solid rgba(24,48,58,.12);border-radius:2px;background:#fff;box-shadow:0 3px 12px rgba(24,48,58,.08);scroll-snap-align:start}
idx-listings-carousel .idx-listing-card__wrap{position:relative;display:block;width:100%;min-width:0;box-sizing:border-box}
idx-listings-carousel .idx-listing-card__image--wrap{position:relative;width:100%!important;height:150px!important;aspect-ratio:auto!important;overflow:hidden;box-sizing:border-box}
idx-listings-carousel .idx-listing-card__image{display:block!important;width:100%!important;height:150px!important;max-width:100%!important;max-height:150px!important;object-fit:cover;box-sizing:border-box}
idx-listings-carousel .idx-listing-card__link{position:absolute;inset:0;z-index:2;display:block}
idx-listings-carousel .idx-listing-card__banner-info{position:absolute!important;top:8px!important;left:8px!important;z-index:3!important;display:flex!important;flex-wrap:wrap!important;gap:4px!important;max-width:calc(100% - 48px)!important}
idx-listings-carousel .idx-listing-card__label{display:block!important;padding:4px 7px!important;background:#12a8df!important;color:#fff!important;font:700 11px/1.1 Arial,sans-serif!important;text-transform:uppercase!important;white-space:nowrap!important}
idx-listings-carousel .idx-listing-card__prop-status{position:absolute!important;left:8px!important;bottom:8px!important;z-index:3!important;display:block!important;padding:4px 7px!important;background:rgba(0,0,0,.78)!important;color:#fff!important;font:600 12px/1.1 Arial,sans-serif!important;white-space:nowrap!important}
idx-listings-carousel .idx-listing-card__details{display:block!important;max-width:100%!important;min-width:0!important;padding:8px 8px 4px!important;box-sizing:border-box!important;overflow-wrap:anywhere!important;color:#111!important;background:#fff!important}
idx-listings-carousel .idx-listing-card__price{font:700 17px/1.2 Arial,sans-serif!important;color:#111!important}
idx-listings-carousel .idx-listing-card__core-fields{display:flex!important;flex-wrap:wrap!important;gap:3px 6px!important;margin-top:3px!important;font:400 11px/1.25 Arial,sans-serif!important;color:#222!important}
idx-listings-carousel .idx-listing-card__address{display:block!important;margin-top:3px!important;font:400 11px/1.25 Arial,sans-serif!important;color:#222!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}
idx-listings-carousel .idx-listing-card__additional-info{display:flex!important;justify-content:flex-end!important;max-width:100%!important;min-width:0!important;padding:0 8px 7px!important;box-sizing:border-box!important;background:#fff!important}
idx-listings-carousel .idx-listing-card__mls img{display:block!important;width:auto!important;max-width:52px!important;height:auto!important;max-height:20px!important;object-fit:contain!important}
@media(max-width:900px){idx-listings-carousel .idx-listings-carousel__properties{gap:10px;padding:12px 16px}}
@media(max-width:767px){main>div>div>header>nav>div:nth-of-type(2){display:none}main>div>div>header>nav>div:nth-of-type(3){display:flex;gap:8px}main>div>div>header>nav>div:nth-of-type(3) a[aria-label="Call us"],main>div>div>header>nav>div:nth-of-type(3) button[aria-label="Open menu"]{display:flex}idx-listings-carousel .idx-listings-carousel__property{flex-basis:calc(100% - 20px)!important;width:calc(100% - 20px)!important;min-width:calc(100% - 20px)!important;max-width:calc(100% - 20px)!important}idx-listings-carousel .idx-listings-carousel__properties{padding:12px 16px}chat-widget{right:12px!important;bottom:12px!important}chat-widget .lc_text-widget{width:min(340px,calc(100vw - 24px))}}
/* Re-assert the safe card geometry after any captured/custom IDX overrides. */
idx-listings-carousel .idx-listings-carousel,idx-listings-carousel .idx-listings-carousel__properties{width:100%!important;min-width:0!important;max-width:100%!important;margin:0!important;box-sizing:border-box!important}
idx-listings-carousel .idx-listings-carousel__properties{display:flex!important;flex-wrap:nowrap!important;gap:12px!important;padding:16px clamp(16px,5vw,80px)!important;overflow-x:auto!important;overflow-y:hidden!important;scrollbar-width:none!important}
idx-listings-carousel .idx-listings-carousel__properties::-webkit-scrollbar{display:none}
idx-listings-carousel .idx-listings-carousel__property{flex:0 0 220px!important;width:220px!important;min-width:220px!important;max-width:220px!important;height:auto!important;overflow:hidden!important;box-sizing:border-box!important}
idx-listings-carousel .idx-listing-card__image--wrap{width:100%!important;height:150px!important;aspect-ratio:auto!important;overflow:hidden!important}
idx-listings-carousel .idx-listing-card__image{width:100%!important;max-width:100%!important;height:150px!important;max-height:150px!important;object-fit:cover!important}
idx-listings-carousel .idx-listing-card__favorite{position:absolute!important;top:10px!important;right:10px!important;z-index:4!important;width:22px!important;height:22px!important;overflow:hidden!important}
idx-listings-carousel .idx-listing-card__favorite svg{display:block!important;width:18px!important;max-width:18px!important;height:18px!important;max-height:18px!important}
@media(max-width:900px){idx-listings-carousel .idx-listings-carousel__properties{gap:10px!important;padding:12px 16px!important}}
@media(max-width:767px){idx-listings-carousel .idx-listings-carousel__property{flex-basis:calc(100% - 20px)!important;width:calc(100% - 20px)!important;min-width:calc(100% - 20px)!important;max-width:calc(100% - 20px)!important}idx-listings-carousel .idx-listings-carousel__properties{padding:12px 16px!important}}
`;
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
    if (/^\s*<(?:!doctype|html|head|body)\b/i.test(text)) return "";
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
