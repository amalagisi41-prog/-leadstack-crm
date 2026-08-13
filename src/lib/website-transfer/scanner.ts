import "server-only";

import { lookup } from "node:dns/promises";
import sanitizeHtml from "sanitize-html";
import type {
  WebsiteTransferInventory,
  WebsiteTransferPage,
} from "@/types/website-transfer";

const PAGE_LIMIT = 20;
const SNAPSHOT_LIMIT = 8;
const SNAPSHOT_CHAR_LIMIT = 70_000;

function isPrivateAddress(address: string): boolean {
  return (
    address === "::1" ||
    address === "0.0.0.0" ||
    address.startsWith("127.") ||
    address.startsWith("10.") ||
    address.startsWith("192.168.") ||
    address.startsWith("169.254.") ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(address) ||
    address.startsWith("fc") ||
    address.startsWith("fd") ||
    address.startsWith("fe80:")
  );
}

async function assertPublicUrl(url: URL) {
  const records = await lookup(url.hostname, { all: true });
  if (
    !records.length ||
    records.some((record) => isPrivateAddress(record.address))
  ) {
    throw new Error("This address is not a public website.");
  }
}

async function fetchPublicPage(url: URL): Promise<Response> {
  let current = url;
  for (let redirect = 0; redirect < 6; redirect += 1) {
    await assertPublicUrl(current);
    const response = await fetch(current, {
      redirect: "manual",
      signal: AbortSignal.timeout(12_000),
      headers: {
        "User-Agent":
          "AgentStack-Site-Transfer/1.0 (+https://agentstackcrm.app)",
      },
    });
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const location = response.headers.get("location");
    if (!location) return response;
    current = new URL(location, current);
  }
  throw new Error("The website redirected too many times.");
}

function matches(html: string, expression: RegExp): string[] {
  const flags = expression.flags.includes("g")
    ? expression.flags
    : `${expression.flags}g`;
  return [...html.matchAll(new RegExp(expression.source, flags))]
    .map((match) => match[1])
    .filter(Boolean);
}

function unique(values: string[], limit = 100): string[] {
  return [...new Set(values)].slice(0, limit);
}

function absolute(value: string, base: URL): string | null {
  try {
    const url = new URL(value, base);
    if (!/^https?:$/.test(url.protocol)) return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function detectTechnology(html: string, headers: Headers) {
  const poweredBy = headers.get("x-powered-by") ?? "";
  const server = headers.get("server") ?? "";
  const lower = html.toLowerCase();
  const cms = lower.includes("wp-content")
    ? "WordPress"
    : lower.includes("cdn.shopify.com")
      ? "Shopify"
      : lower.includes("static.wixstatic.com")
        ? "Wix"
        : lower.includes("highlevel") || lower.includes("leadconnector")
          ? "HighLevel"
          : lower.includes("__next_data__")
            ? "Next.js"
            : poweredBy || null;
  const hosting = headers.get("x-vercel-id")
    ? "Vercel"
    : headers.get("cf-ray")
      ? "Cloudflare"
      : server || null;
  return { cms, hosting };
}

function safeSnapshot(html: string, source: URL): string {
  const withBase = html.replace(
    /<head([^>]*)>/i,
    `<head$1><base href="${source.origin}/">`
  );
  return sanitizeHtml(withBase, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat([
      "html",
      "head",
      "body",
      "style",
      "link",
      "meta",
      "picture",
      "source",
      "svg",
      "path",
    ]),
    allowedAttributes: {
      "*": ["class", "id", "style", "title", "aria-*", "role"],
      html: ["lang"],
      link: ["rel", "href", "media", "type"],
      meta: ["name", "content", "property", "charset", "http-equiv"],
      img: ["src", "srcset", "sizes", "alt", "width", "height", "loading"],
      source: ["src", "srcset", "type", "media", "sizes"],
      a: ["href", "target", "rel"],
      form: ["action", "method"],
      input: ["type", "name", "value", "placeholder", "checked"],
      textarea: ["name", "placeholder"],
      button: ["type"],
      svg: ["viewBox", "fill", "stroke", "xmlns"],
      path: ["d", "fill", "stroke"],
    },
    allowedSchemes: ["http", "https", "mailto", "tel", "data"],
    transformTags: {
      form: (_tag, attrs) => ({
        tagName: "div",
        attribs: { ...attrs, "data-agentstack-form": "disabled" },
      }),
      a: (_tag, attrs) => ({
        tagName: "a",
        attribs: { ...attrs, target: "_blank", rel: "noreferrer" },
      }),
    },
    exclusiveFilter(frame) {
      return ["script", "iframe", "object", "embed"].includes(frame.tag);
    },
  }).slice(0, SNAPSHOT_CHAR_LIMIT);
}

export async function scanWebsite(sourceUrl: string): Promise<{
  pages: WebsiteTransferPage[];
  inventory: WebsiteTransferInventory;
}> {
  const root = new URL(sourceUrl);
  const queue = [root.toString()];
  const seen = new Set<string>();
  const pages: WebsiteTransferPage[] = [];
  const allLinks: string[] = [];
  const images: string[] = [];
  const fonts: string[] = [];
  const colors: string[] = [];
  const stylesheets: string[] = [];
  const scripts: string[] = [];
  const tracking: string[] = [];
  const redirects: string[] = [];
  let forms = 0;
  let cms: string | null = null;
  let hosting: string | null = null;

  while (queue.length && seen.size < PAGE_LIMIT) {
    const current = queue.shift()!;
    if (seen.has(current)) continue;
    seen.add(current);
    try {
      const response = await fetchPublicPage(new URL(current));
      const contentType = response.headers.get("content-type") ?? "";
      if (!response.ok || !contentType.includes("text/html")) {
        pages.push({
          url: current,
          path: new URL(current).pathname,
          title: "Unavailable page",
          description: "",
          status: "cannot_access",
          httpStatus: response.status,
          imageCount: 0,
          formCount: 0,
          scriptCount: 0,
          notes: ["The source server did not return an accessible web page."],
        });
        continue;
      }
      const html = await response.text();
      const base = new URL(response.url);
      if (response.url !== current)
        redirects.push(`${current} → ${response.url}`);
      const hrefs = matches(html, /<a\b[^>]*href=["']([^"']+)["']/gi)
        .map((href) => absolute(href, base))
        .filter((value): value is string => Boolean(value));
      const internal = hrefs.filter(
        (href) => new URL(href).hostname === root.hostname
      );
      allLinks.push(...internal);
      for (const href of internal)
        if (!seen.has(href) && queue.length < PAGE_LIMIT * 3) queue.push(href);
      const pageImages = matches(html, /<img\b[^>]*src=["']([^"']+)["']/gi)
        .map((src) => absolute(src, base))
        .filter((value): value is string => Boolean(value));
      const pageStyles = matches(
        html,
        /<link\b[^>]*rel=["'][^"']*stylesheet[^"']*["'][^>]*href=["']([^"']+)["']/gi
      )
        .concat(
          matches(
            html,
            /<link\b[^>]*href=["']([^"']+)["'][^>]*rel=["'][^"']*stylesheet/gi
          )
        )
        .map((src) => absolute(src, base))
        .filter((value): value is string => Boolean(value));
      const pageScripts = matches(html, /<script\b[^>]*src=["']([^"']+)["']/gi)
        .map((src) => absolute(src, base))
        .filter((value): value is string => Boolean(value));
      const pageForms = (html.match(/<form\b/gi) ?? []).length;
      images.push(...pageImages);
      stylesheets.push(...pageStyles);
      scripts.push(...pageScripts);
      forms += pageForms;
      fonts.push(
        ...matches(html, /font-family\s*:\s*([^;}"']+)/gi).map((v) => v.trim())
      );
      colors.push(...matches(html, /(#[0-9a-f]{3,8}|rgba?\([^)]+\))/gi));
      if (/googletagmanager|google-analytics|gtag\(/i.test(html))
        tracking.push("Google Analytics / Tag Manager");
      if (/connect\.facebook\.net|fbq\(/i.test(html))
        tracking.push("Meta Pixel");
      const tech = detectTechnology(html, response.headers);
      cms ||= tech.cms;
      hosting ||= tech.hosting;
      const title =
        matches(html, /<title[^>]*>([\s\S]*?)<\/title>/i)[0]
          ?.replace(/<[^>]+>/g, "")
          .trim() || base.pathname;
      const description =
        matches(
          html,
          /<meta\b[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i
        )[0] ?? "";
      const notes: string[] = [];
      if (pageForms)
        notes.push(
          `${pageForms} form${pageForms === 1 ? "" : "s"} copied as disabled preview elements.`
        );
      if (pageScripts.length)
        notes.push(
          "Interactive scripts require approval and a safe replacement connection."
        );
      pages.push({
        url: response.url,
        path: base.pathname || "/",
        title,
        description,
        status: pageScripts.length ? "needs_approval" : "copied",
        httpStatus: response.status,
        imageCount: pageImages.length,
        formCount: pageForms,
        scriptCount: pageScripts.length,
        notes,
        snapshotHtml:
          pages.length < SNAPSHOT_LIMIT ? safeSnapshot(html, base) : undefined,
      });
    } catch (error) {
      pages.push({
        url: current,
        path: new URL(current).pathname,
        title: "Cannot access",
        description: "",
        status: "cannot_access",
        httpStatus: null,
        imageCount: 0,
        formCount: 0,
        scriptCount: 0,
        notes: [
          error instanceof Error
            ? error.message
            : "The page could not be read.",
        ],
      });
    }
  }

  return {
    pages,
    inventory: {
      pages: pages.length,
      navigationLinks: unique(allLinks),
      images: unique(images),
      fonts: unique(fonts, 30),
      colors: unique(colors, 30),
      stylesheets: unique(stylesheets),
      scripts: unique(scripts),
      forms,
      tracking: unique(tracking),
      redirects: unique(redirects),
      cms,
      hosting,
      dnsProvider: hosting === "Cloudflare" ? "Cloudflare" : null,
    },
  };
}
