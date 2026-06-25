import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { getAgentProfile, upsertAgentProfile } from "@/lib/comms/ai/agent";
import {
  firecrawlIsConfigured,
  scrapeUrl,
  FirecrawlError,
} from "@/lib/firecrawl/client";

export const dynamic = "force-dynamic";

/** Cap stored KB at ~6000 chars. Each refresh re-snapshots the homepage,
 *  so the bigger concern is bloating the system prompt — Haiku reads
 *  this on every inbound reply. ~6000 chars ≈ ~1500 tokens. */
const MAX_KB_CHARS = 6000;

/**
 * Triggers a Firecrawl scrape of the profile's saved websiteUrl, stores
 * the resulting markdown back onto the profile as `websiteKb`, and stamps
 * `websiteKbFetchedAt`. Admin-only.
 *
 * Returns 400 if no URL is saved; 503 if Firecrawl isn't configured; 502
 * if Firecrawl rejected the URL (paywall, robots, etc.). Errors do NOT
 * clobber the existing KB — the operator keeps the previous snapshot
 * until a refresh succeeds.
 */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const auth = await requireSubAccountAdmin(request, id);
  if (auth instanceof NextResponse) return auth;

  if (!firecrawlIsConfigured()) {
    return NextResponse.json(
      {
        error:
          "Firecrawl is not configured. Set FIRECRAWL_API_KEY on the agency deployment.",
      },
      { status: 503 },
    );
  }

  const profile = await getAgentProfile(id);
  const url = profile?.websiteUrl?.trim();
  if (!url) {
    return NextResponse.json(
      { error: "Save a website URL on the agent profile first." },
      { status: 400 },
    );
  }

  let result;
  try {
    result = await scrapeUrl(url);
  } catch (err) {
    if (err instanceof FirecrawlError) {
      return NextResponse.json(
        { error: err.message },
        { status: err.status >= 500 ? 502 : 400 },
      );
    }
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error(`[ai-agent/refresh-kb] sa=${id} failed:`, msg);
    return NextResponse.json(
      { error: "Failed to fetch the website. Try again in a minute." },
      { status: 502 },
    );
  }

  const kb = result.markdown.slice(0, MAX_KB_CHARS);
  await upsertAgentProfile(id, {
    websiteKb: kb,
    websiteKbFetchedAt: FieldValue.serverTimestamp(),
  });

  const updated = await getAgentProfile(id);
  return NextResponse.json({
    ok: true,
    profile: updated,
    chars: kb.length,
    truncated: result.markdown.length > MAX_KB_CHARS,
  });
}
