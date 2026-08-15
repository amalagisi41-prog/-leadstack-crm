import "server-only";

import { gunzipSync } from "node:zlib";
import { NextResponse } from "next/server";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { getAdminDb } from "@/lib/firebase/admin";
import {
  extractStylesheetUrls,
  inlineStylesheetAssets,
  classlessSnapshotStyles,
  classlessSemanticLayoutStyles,
  classlessEmbeddedWidgetStyles,
  normalizeCapturedStylesheetLinks,
  removeCapturedCsp,
  removeCapturedStyleText,
} from "@/lib/website-transfer/styles";
import { fetchPublicPage, safeSnapshot } from "@/lib/website-transfer/scanner";

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
  const snapshotData = snapshot.data() ?? {};
  const htmlGzip = snapshotData.htmlGzip;
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
  const sourceUrl = String(transfer.data()?.sourceUrl ?? "");
  const pageUrl = String(snapshotData.url ?? sourceUrl);
  const liveRequested = url.searchParams.get("live") === "1";
  let liveLoaded = false;
  let liveSource: URL | null = null;

  // The left comparison pane should reflect the current public source, while
  // the replacement pane remains pinned to the captured private artifact.
  if (liveRequested && pageUrl) {
    try {
      const liveResponse = await fetchPublicPage(new URL(pageUrl));
      const contentType = liveResponse.headers.get("content-type") ?? "";
      if (liveResponse.ok && contentType.includes("text/html")) {
        const liveHtml = await liveResponse.text();
        liveSource = new URL(liveResponse.url || pageUrl);
        const liveStylesheets = extractStylesheetUrls(liveHtml, liveSource);
        html = await safeSnapshot(
          liveHtml,
          liveSource,
          liveStylesheets,
          new Map<string, Promise<string>>()
        );
        liveLoaded = true;
      }
    } catch {
      // Preserve the captured source as a reliable comparison fallback.
    }
  }

  if (liveRequested && !liveLoaded) {
    return new NextResponse(
      "The live source is temporarily unavailable. Refresh the preview to try again.",
      {
        status: 503,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-store",
        },
      }
    );
  }

  if (!html)
    return new NextResponse("Preview unavailable for this page.", {
      status: 404,
    });
  html = removeCapturedStyleText(removeCapturedCsp(html)).replace(
    /<base\b[^>]*>/gi,
    ""
  );
  const source = sourceUrl ? new URL(sourceUrl) : null;
  const stylesheetBase = liveSource ?? source;
  const stylesheetUrls = stylesheetBase
    ? extractStylesheetUrls(html, stylesheetBase)
    : [];
  html = normalizeCapturedStylesheetLinks(html, stylesheetUrls, stylesheetBase);
  const inlineCss = await inlineStylesheetAssets(
    stylesheetUrls
  );
  console.info("[website-transfer] preview styles", {
    id,
    index,
    stylesheetCount: stylesheetUrls.length,
    inlineCssChars: inlineCss.length,
    htmlChars: html.length,
  });
  const baseHref = (liveSource ?? source)?.href;
  const baseTag = baseHref
    ? '<base href="' + baseHref.replace(/\"/g, "&quot;") + '">'
    : "";
  const styleTag = inlineCss
    ? '<style id="agentstack-captured-styles">' +
      inlineCss.replace(/<\/style/gi, "<\\/style") +
      "</style>"
    : "";
  // Public-site styles can be rejected by an isolated browser frame (for
  // example when a source stylesheet is served with restrictive CORS or
  // framework-dependent layers). Keep the real DOM and assets, then add a
  // deterministic semantic guardrail so the baseline never degrades to raw
  // browser defaults while it is being reviewed.
  const baseClasslessCss = classlessSnapshotStyles(html, false);
  const classlessCss = liveLoaded
    ? ""
    : baseClasslessCss
      ? baseClasslessCss + classlessSemanticLayoutStyles() + classlessEmbeddedWidgetStyles()
      : "";
  const classlessStyleTag = classlessCss
    ? '<style id="agentstack-classless-fallback">' + classlessCss + '</style>'
    : "";
  if (baseTag || styleTag || classlessStyleTag) {
    html = /<head[^>]*>/i.test(html)
      ? html.replace(/<head([^>]*)>/i, "<head$1>" + baseTag + styleTag + classlessStyleTag)
      : baseTag + styleTag + classlessStyleTag + html;
  }
  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy":
        "default-src 'self' https: data:; style-src 'self' https: 'unsafe-inline'; img-src 'self' https: data: blob:; font-src 'self' https: data:; script-src 'none'; frame-src 'none'; object-src 'none'; frame-ancestors 'self'; form-action 'none';",
      "Cache-Control": "private, no-store",
      "X-AgentStack-Preview-Mode": liveLoaded ? "live-baseline" : "captured",
      "X-AgentStack-Stylesheet-Count": String(stylesheetUrls.length),
    },
  });
}
