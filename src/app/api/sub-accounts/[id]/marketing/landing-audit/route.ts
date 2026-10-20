import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { auditLandingPage } from "@/lib/marketing/landing-audit";
import { normalizeImportUrl } from "@/lib/website/import-converter";
import { firecrawlIsConfigured } from "@/lib/firecrawl/client";
import { aiIsConfigured } from "@/lib/comms/ai/openrouter";

/**
 * POST /api/sub-accounts/[id]/marketing/landing-audit
 * Body: { url: string }
 *
 * See lib/marketing/landing-audit.ts for what this actually checks (content
 * only — CTA, trust signals, contact info, clarity — never layout or mobile
 * rendering, which Firecrawl's markdown output can't see). Admin-only.
 */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;

  if (!firecrawlIsConfigured()) {
    return NextResponse.json(
      {
        error:
          "FIRECRAWL_API_KEY is not set on this deployment. Set it to enable landing-page audits.",
      },
      { status: 503 }
    );
  }
  if (!aiIsConfigured()) {
    return NextResponse.json(
      {
        error:
          "OPENROUTER_API_KEY is not set on this deployment. Set it to enable landing-page audits.",
      },
      { status: 503 }
    );
  }

  let body: { url?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (typeof body.url !== "string" || !body.url.trim()) {
    return NextResponse.json({ error: "`url` is required." }, { status: 400 });
  }

  let normalized: URL;
  try {
    normalized = normalizeImportUrl(body.url);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid URL." },
      { status: 400 }
    );
  }

  try {
    const result = await auditLandingPage(normalized.toString());
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not audit that page.",
      },
      { status: 502 }
    );
  }
}
