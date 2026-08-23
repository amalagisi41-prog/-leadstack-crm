import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { MAX_WEBSITES_PER_SUBACCOUNT } from "@/lib/website/limits";
import {
  scrapeUrl,
  firecrawlIsConfigured,
  FirecrawlError,
} from "@/lib/firecrawl/client";
import { importWebsiteFromDomain } from "@/lib/website/import-converter";
import { validateWebsiteConfig } from "@/lib/website/validation";
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

    // Tell the operator up front which fields the scrape could not fill, so
    // the UI can land them on those fields instead of letting them discover
    // it at Build time. Import deliberately leaves unresolved fields empty
    // rather than inventing placeholders (see import-converter.ts).
    const missingFields = Object.keys(validateWebsiteConfig(config));

    return NextResponse.json({ ok: true, siteId: ref.id, missingFields });
  } catch (err) {
    // A bad address is the operator's typo, not a server failure — 400 with
    // the specific message rather than a generic 502.
    if (err instanceof Error && !(err instanceof FirecrawlError)) {
      const isInputError =
        /valid website address|public website address|Only http|Enter a website/i.test(
          err.message,
        );
      if (isInputError) {
        return NextResponse.json({ error: err.message }, { status: 400 });
      }
    }

    if (err instanceof FirecrawlError) {
      // Pass the rate limit through as a rate limit. Firecrawl's default cap
      // is 30 scrapes/hour/agency; surfacing that as a generic "could not
      // import" told the operator their site had failed when they only
      // needed to wait.
      if (err.status === 429) {
        return NextResponse.json(
          {
            error:
              "Too many website imports in the last hour. Wait a few minutes and try again.",
          },
          { status: 429, headers: { "Retry-After": "300" } },
        );
      }
      if (err.status === 503) {
        return NextResponse.json({ error: err.message }, { status: 503 });
      }
      // 4xx from Firecrawl is usually an unreachable or blocked site.
      if (err.status >= 400 && err.status < 500) {
        return NextResponse.json(
          {
            error: `We couldn't read that website. It may be password-protected, blocking automated readers, or temporarily offline.`,
          },
          { status: 422 },
        );
      }
    }

    const message =
      err instanceof Error ? err.message : "Unknown error during import";
    console.error("[website/import]", message, err);
    return NextResponse.json(
      { error: `Could not import website: ${message}` },
      { status: 502 },
    );
  }
}
