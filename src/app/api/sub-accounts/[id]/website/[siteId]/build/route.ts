import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { validateWebsiteConfig } from "@/lib/website/validation";
import { isNicheKey } from "@/lib/website/niches";
import {
  GitpageError,
  gitpageIsConfigured,
  submitBuild,
} from "@/lib/gitpage/client";
import {
  markGitpageBuildSucceeded,
  markGitpageKeyInvalid,
} from "@/lib/gitpage/heartbeat";
import { publishCallback, qstashIsConfigured } from "@/lib/automations/qstash";
import type { WebsiteConfig, WebsiteDoc } from "@/types/website";

/**
 * Submit a build for one of the sub-account's websites
 * (`subAccounts/{id}/website/{siteId}`). On success the doc is persisted with
 * status: "queued" + the gitpage formResponseId; the client's onSnapshot picks
 * it up and flips that card to the Building view. The first QStash poll is
 * scheduled against `/website/{siteId}/poll`, which reschedules itself until
 * the build settles. Each site polls its own doc independently.
 */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string; siteId: string }> },
) {
  const { id: subAccountId, siteId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;

  // Agency-level gate. Builds consume the agency's shared gitpage quota, so
  // the website builder is off unless the agency owner explicitly enables it.
  const db = getAdminDb();
  const subSnap = await db.doc(`subAccounts/${subAccountId}`).get();
  if (!subSnap.exists) {
    return NextResponse.json(
      { error: "Sub-account not found" },
      { status: 404 },
    );
  }
  if (subSnap.data()?.websiteEnabledByAgency !== true) {
    return NextResponse.json(
      {
        error:
          "The website builder is disabled for this sub-account. Your agency administrator can enable it from Manage in the agency sub-accounts list.",
      },
      { status: 403 },
    );
  }

  if (!gitpageIsConfigured()) {
    return NextResponse.json(
      {
        error:
          "gitpage is not configured on this deployment (GITPAGE_API_KEY missing).",
      },
      { status: 503 },
    );
  }

  let body: { config?: WebsiteConfig };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const config = body.config;
  if (!config || typeof config !== "object") {
    return NextResponse.json(
      { error: "Body must include `config` object." },
      { status: 400 },
    );
  }

  // Server hard-codes the system fields so the client can't override.
  config.site_type = "LocalSite";
  config.astra_theme = false;

  // Default missing build_type to "local" — back-compat for docs written
  // before VSL shipped. Reject anything else so a malicious client can't
  // sneak in an unsupported buildType (gitpage would 400 anyway, but
  // failing here keeps Firestore clean).
  if (config.build_type !== "vsl") {
    config.build_type = "local";
  }

  // Niche is optional. Reject unknown values rather than letting them through
  // and triggering a gitpage 400. null / undefined map to "no niche".
  if (config.niche != null && !isNicheKey(config.niche)) {
    return NextResponse.json(
      {
        error:
          "niche must be one of: home_services, real_estate, gym_fitness. Omit for a generic build.",
      },
      { status: 400 },
    );
  }
  config.niche = isNicheKey(config.niche) ? config.niche : null;

  if (config.build_type === "local") {
    if (!config.local_page_selections) {
      return NextResponse.json(
        { error: "local_page_selections is required." },
        { status: 400 },
      );
    }
    config.local_page_selections.index = true;

    if (config.niche) {
      // Niche locks the page set to all five pages. Force the selections so
      // the persisted doc reflects what gitpage actually built. business_details
      // are required (contact is forced on); keep them populated.
      config.local_page_selections = {
        index: true,
        services: true,
        contact: true,
        privacy: true,
        terms: true,
      };
      // services_config stays as-is — optional, gitpage uses niche default
      // when null. business_details stays as-is — validation will catch missing.
    } else {
      // Generic local: drop conditional sections that don't apply (cleaner
      // payload to gitpage).
      if (!config.local_page_selections.services) {
        config.services_config = null;
      }
      if (!config.local_page_selections.contact) {
        config.business_details = null;
      }
    }
  } else {
    // VSL is single-page — pages array, services, and business details are
    // ignored by gitpage. Force them to a clean shape so Firestore doesn't
    // hold stale data from a previous local-mode draft. Niche key (if set)
    // still flows through for VSL.
    config.local_page_selections = {
      index: true,
      services: false,
      contact: false,
      privacy: false,
      terms: false,
    };
    config.services_config = null;
    config.business_details = null;
  }

  const errors = validateWebsiteConfig(config);
  if (Object.keys(errors).length > 0) {
    return NextResponse.json(
      { error: "Validation failed.", fieldErrors: errors },
      { status: 400 },
    );
  }

  // Pull agencyId + subAccount name from the parent doc (already fetched above
  // for the agency gate check).
  const subAccountData = subSnap.data();
  const agencyId = subAccountData?.agencyId as string | undefined;
  const subAccountName = subAccountData?.name as string | undefined;
  if (!agencyId) {
    return NextResponse.json(
      { error: "Sub-account is missing agencyId." },
      { status: 500 },
    );
  }

  // Submit to gitpage. On 4xx we surface their error verbatim. On 5xx /
  // network failure we mark the doc as failed and tell the client.
  let submission;
  try {
    submission = await submitBuild({
      config,
      subAccountId,
      subAccountName,
    });
  } catch (err) {
    if (err instanceof GitpageError) {
      // 401 means the API key is invalid (rotated upstream, never set,
      // typo'd). The heartbeat won't catch this — it checks the owner's
      // subscription, not key validity. Flip the cached status so the UI
      // surfaces the correct CTA on next load.
      if (err.status === 401) {
        await markGitpageKeyInvalid();
      }
      return NextResponse.json(
        {
          error: err.message,
          gitpageStatus: err.status,
          gitpageBody: err.body,
        },
        { status: err.status },
      );
    }
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Could not reach gitpage.",
      },
      { status: 502 },
    );
  }

  // The build was accepted (gitpage returned 202). That's stronger
  // evidence of activation than the heartbeat: gitpage rejects builds
  // when the subscription is inactive or the key is invalid. Override
  // any stale `agency: false` cache so the activation gate clears
  // immediately.
  await markGitpageBuildSucceeded();

  const docRef = db.doc(`subAccounts/${subAccountId}/website/${siteId}`);
  const snap = await docRef.get();
  const isFirst = !snap.exists;

  const update: Partial<WebsiteDoc> & {
    config: WebsiteConfig;
    updatedAt: FieldValue;
  } = {
    config,
    status: "queued",
    gitpageJobId: submission.formResponseId,
    liveUrl: null,
    errorMessage: null,
    partialErrors: null,
    pollAttempts: 0,
    lastBuildAt: FieldValue.serverTimestamp() as unknown as null,
    lastBuildByUid: access.uid,
    updatedAt: FieldValue.serverTimestamp(),
  };

  if (isFirst) {
    // The doc is normally created up-front via POST /website, but a direct
    // build on a never-created id (e.g. the legacy `main`) still stamps
    // tenancy so the row is well-formed.
    Object.assign(update, {
      id: siteId,
      agencyId,
      subAccountId,
      createdAt: FieldValue.serverTimestamp(),
    });
  }

  await docRef.set(update, { merge: true });

  // Schedule the first QStash poll. If QStash isn't configured, the build
  // doc just sits at "queued" — the operator can still verify the build in
  // gitpage's dashboard. We don't fail the request for this.
  if (qstashIsConfigured()) {
    await publishCallback({
      pathname: `/api/sub-accounts/${subAccountId}/website/${siteId}/poll`,
      body: {
        subAccountId,
        siteId,
        formResponseId: submission.formResponseId,
      },
      // First poll fires after gitpage's recommended wait — gives their
      // queue a moment to start work.
      delaySeconds: 20,
      deduplicationId: `website_${subAccountId}_${siteId}_${submission.formResponseId}_0`,
    });
  } else {
    console.warn(
      "[website/build] QStash not configured — status will sit at queued",
    );
  }

  return NextResponse.json({
    ok: true,
    status: "queued",
    formResponseId: submission.formResponseId,
    estimatedDurationSeconds: submission.estimatedDurationSeconds,
  });
}
