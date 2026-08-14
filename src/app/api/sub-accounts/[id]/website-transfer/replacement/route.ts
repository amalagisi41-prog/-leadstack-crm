import "server-only";

import { gunzipSync } from "node:zlib";
import { NextResponse } from "next/server";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { getAdminDb } from "@/lib/firebase/admin";
import {
  extractStylesheetUrls,
  inlineStylesheetAssets,
} from "@/lib/website-transfer/styles";

/**
 * Serves the isolated AgentStack replacement artifact. The scan snapshot is
 * source evidence; this route turns that evidence into a separately served,
 * inert site build that can later receive approved forms and integrations.
 */
export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const access = await requireSubAccountAdmin(request, id);
  if (access instanceof NextResponse) return access;

  const url = new URL(request.url);
  const index = Math.max(0, Number(url.searchParams.get("page") ?? 0));
  const ref = getAdminDb().doc(`subAccounts/${id}/websiteTransfers/current`);
  const [snapshot, transfer] = await Promise.all([
    ref.collection("snapshots").doc(String(index)).get(),
    ref.get(),
  ]);
  const htmlGzip = snapshot.data()?.htmlGzip;
  const legacyPage = transfer.data()?.pages?.[index] as
    | { snapshotHtml?: string }
    | undefined;
  let html = legacyPage?.snapshotHtml;
  if (typeof htmlGzip === "string") {
    try {
      html = gunzipSync(Buffer.from(htmlGzip, "base64")).toString("utf8");
    } catch {
      html = undefined;
    }
  }
  if (!html)
    return new NextResponse("Replacement unavailable for this page.", {
      status: 404,
    });

  const replacements = Array.isArray(snapshot.data()?.replacements)
    ? (snapshot.data()?.replacements as Array<{
        find?: unknown;
        replace?: unknown;
      }>)
    : [];
  for (const replacement of replacements) {
    if (
      typeof replacement.find === "string" &&
      replacement.find &&
      typeof replacement.replace === "string"
    ) {
      html = html.split(replacement.find).join(replacement.replace);
    }
  }
  const customCss = String(snapshot.data()?.customCss ?? "");
  const transferData = transfer.data() ?? {};
  const inventory = (transferData.inventory ?? {}) as {
    stylesheets?: unknown;
  };
  const stylesheetLinks = Array.isArray(inventory.stylesheets)
    ? inventory.stylesheets
        .filter((value): value is string => {
          try {
            return /^https?:$/.test(new URL(value).protocol);
          } catch {
            return false;
          }
        })
        .slice(0, 24)
        .map((href) => {
          const safeHref = href.replace(/&/g, "&amp;").replace(/\"/g, "&quot;");
          return '<link rel="stylesheet" href="' + safeHref + '">';
        })
        .join("")
    : "";
  const sourceUrl =
    typeof transferData.sourceUrl === "string" ? transferData.sourceUrl : "";
  const source = sourceUrl ? new URL(sourceUrl) : null;
  const stylesheetUrls = [
    ...(Array.isArray(inventory.stylesheets)
      ? inventory.stylesheets.filter(
          (value): value is string => typeof value === "string"
        )
      : []),
    ...(source ? extractStylesheetUrls(html, source) : []),
  ];
  const inlineCss = await inlineStylesheetAssets(stylesheetUrls);
  // Some origin hosts (notably sites behind an intermittently resolvable DNS
  // provider) allow the browser to load their CSS but reject server-side
  // asset fetches. In that case, serving the raw captured HTML is misleading.
  // Fall back to the read-only origin page inside the sandboxed preview so the
  // operator still sees the real design while the private artifact remains
  // unchanged. Once the stylesheet capture succeeds, this route serves the
  // isolated replacement again.
  if (!inlineCss.trim() && !customCss.trim()) {
    const pageUrl =
      typeof snapshot.data()?.url === "string"
        ? snapshot.data()?.url
        : sourceUrl;
    try {
      if (pageUrl) return NextResponse.redirect(new URL(pageUrl), 307);
    } catch {
      // Keep the captured fallback below if the source URL is malformed.
    }
  }
  const baseTag = sourceUrl
    ? '<base href="' + sourceUrl.replace(/\"/g, "&quot;") + '">'
    : "";
  const inlineStyleTag = inlineCss
    ? '<style id="agentstack-captured-styles">' +
      inlineCss.replace(/<\/style/gi, "<\\/style") +
      "</style>"
    : "";
  const styleBootstrap = baseTag + stylesheetLinks + inlineStyleTag;
  const buildMarker = `<meta name="agentstack-build" content="private-replacement"><meta name="robots" content="noindex,nofollow"><style id="agentstack-replacement-safety">form{pointer-events:none}button,input,select,textarea{cursor:not-allowed}</style><style id="agentstack-ai-code-overrides">${customCss.replace(/<\/style/gi, "<\\/style")}</style>`;
  const replacement = /<head[^>]*>/i.test(html)
    ? html.replace(/<head([^>]*)>/i, "<head$1>" + styleBootstrap + buildMarker)
    : styleBootstrap + buildMarker + html;

  return new NextResponse(replacement, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy":
        "default-src 'self' https: data:; style-src 'self' https: 'unsafe-inline'; img-src 'self' https: data: blob:; font-src 'self' https: data:; script-src 'none'; frame-src 'none'; object-src 'none'; frame-ancestors 'self'; form-action 'none';",
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex, nofollow",
      "X-AgentStack-Build": "private-replacement",
    },
  });
}
