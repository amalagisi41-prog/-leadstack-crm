import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { MAX_WEBSITES_PER_SUBACCOUNT } from "@/lib/website/limits";
import { scrapeUrl, firecrawlIsConfigured } from "@/lib/firecrawl/client";
import {
  importWebsiteFromDomain,
} from "@/lib/website/import-converter";
import type { WebsiteDoc } from "@/types/website";

/**
 * POST /api/sub-accounts/[id]/website/import
 *
 * Import an existing website domain, scrape it with Firecrawl, convert the
 * content to a WebsiteConfig template, and create a new website doc.
 *
 * Request body: { domain: "example.com" or "https://example.com" }
 * Response: { ok: true, siteId: "..." }
 */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;

  // Check Firecrawl is configured
  if (!firecrawlIsConfigured()) {
    return NextResponse.json(
      {
        error:
          "Website import requires Firecrawl to be configured. Add FIRECRAWL_API_KEY to your environment.",
      },
      { status: 503 },
    );
  }

  let domain: string;
  try {
    const body = (await request.json()) as { domain?: string };
    domain = body.domain?.trim() || "";
    if (!domain) {
      return NextResponse.json(
        { error: "domain is required" },
        { status: 400 },
      );
    }
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const db = getAdminDb();
  const subSnap = await db.doc(`subAccounts/${subAccountId}`).get();
  if (!subSnap.exists) {
    return NextResponse.json({ error: "Sub-account not found" }, { status: 404 });
  }
  const subData = subSnap.data();
  if (subData?.websiteEnabledByAgency !== true) {
    return NextResponse.json(
      {
        error:
          "The website builder is disabled for this sub-account. Your agency administrator can enable it from Manage in the agency sub-accounts list.",
      },
      { status: 403 },
    );
  }
  const agencyId = subData?.agencyId as string | undefined;
  if (!agencyId) {
    return NextResponse.json(
      { error: "Sub-account is missing agencyId." },
      { status: 500 },
    );
  }

  const col = db.collection(`subAccounts/${subAccountId}/website`);
  const existing = await col.get();
  if (existing.size >= MAX_WEBSITES_PER_SUBACCOUNT) {
    return NextResponse.json(
      {
        error: `You can create up to ${MAX_WEBSITES_PER_SUBACCOUNT} websites per sub-account. Remove one to add another.`,
      },
      { status: 409 },
    );
  }

  try {
    // Scrape and convert
    const config = await importWebsiteFromDomain(domain, scrapeUrl);

    // Create the website doc
    const ref = col.doc();
    const now = FieldValue.serverTimestamp();
    const docData: Omit<WebsiteDoc, "createdAt" | "updatedAt" | "lastBuildAt"> & {
      createdAt: FieldValue;
      updatedAt: FieldValue;
      lastBuildAt: null;
    } = {
      id: ref.id,
      agencyId,
      subAccountId,
      name: `Imported from ${domain}`,
      status: "draft",
      gitpageJobId: null,
      liveUrl: null,
      errorMessage: null,
      partialErrors: null,
      pollAttempts: 0,
      lastBuildAt: null,
      lastBuildByUid: null,
      config,
      createdAt: now,
      updatedAt: now,
    };
    await ref.set(docData);

    return NextResponse.json({ ok: true, siteId: ref.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error during import";
    console.error("[website/import]", message, err);
    return NextResponse.json(
      { error: `Could not import website: ${message}` },
      { status: 502 },
    );
  }
}
