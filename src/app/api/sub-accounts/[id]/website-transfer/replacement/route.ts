import "server-only";

import { gunzipSync } from "node:zlib";
import { NextResponse } from "next/server";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { getAdminDb } from "@/lib/firebase/admin";

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

  const buildMarker = `<meta name="agentstack-build" content="private-replacement"><meta name="robots" content="noindex,nofollow"><style id="agentstack-replacement-safety">form{pointer-events:none}button,input,select,textarea{cursor:not-allowed}</style>`;
  const replacement = /<head[^>]*>/i.test(html)
    ? html.replace(/<head([^>]*)>/i, `<head$1>${buildMarker}`)
    : `${buildMarker}${html}`;

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
