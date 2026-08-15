import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import {
  websiteStudioGateOpen,
  WEBSITE_STUDIO_LOCKED_MESSAGE,
} from "@/lib/website-studio/gate";
import { AGENT_SITE_TEMPLATES } from "@/lib/website-studio/templates";
import { applyDesignFields } from "@/lib/website-studio/design";
import {
  emptyAgentSiteContent,
  emptyAgentSiteDesign,
  type AgentSiteContent,
  type AgentSiteDesign,
  type AgentSiteTemplateId,
} from "@/types/agent-site";
import {
  EMPTY_BUSINESS_PROFILE,
  type BusinessProfileContent,
} from "@/types/business-profile";
import {
  hydrateAgentSiteFromBlueprint,
  isUntouchedAgentSite,
} from "@/lib/website-studio/blueprint-content";

/**
 * Website Studio site persistence. One primary site per sub-account at
 * `subAccounts/{id}/agentSites/main` in v1.
 *
 * GET   — return the site (or { site: null } if not started).
 * PATCH — upsert templateId / content / slug / status. Creates the doc on
 *         first write (templateId required then).
 */

const SITE_ID = "main";

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "site"
  );
}

export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;

  if (!(await websiteStudioGateOpen(subAccountId))) {
    return NextResponse.json(
      { error: WEBSITE_STUDIO_LOCKED_MESSAGE },
      { status: 403 }
    );
  }

  const snap = await getAdminDb()
    .doc(`subAccounts/${subAccountId}/agentSites/${SITE_ID}`)
    .get();

  return NextResponse.json({ site: snap.exists ? snap.data() : null });
}

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;
  const { uid, agencyId } = access;
  if (!agencyId) {
    return NextResponse.json({ error: "Agency not found" }, { status: 400 });
  }

  if (!(await websiteStudioGateOpen(subAccountId))) {
    return NextResponse.json(
      { error: WEBSITE_STUDIO_LOCKED_MESSAGE },
      { status: 403 }
    );
  }

  let body: {
    templateId?: string;
    content?: Partial<AgentSiteContent>;
    design?: Record<string, unknown>;
    status?: "draft" | "published";
    slug?: string;
    designerStep?: number;
    designerTranscript?: unknown;
    hydrateFromBlueprint?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const db = getAdminDb();
  const workspaceSnap = await db.doc(`subAccounts/${subAccountId}`).get();
  const foundation = workspaceSnap.data()?.onboardingFoundation as
    | {
        domainStartingPoint?: string | null;
        hostingStartingPoint?: string | null;
        domainSetupConfirmed?: boolean;
        hostingSetupConfirmed?: boolean;
      }
    | undefined;
  if (
    !foundation?.domainStartingPoint ||
    foundation.domainStartingPoint === "not_sure" ||
    !foundation.hostingStartingPoint ||
    foundation.domainSetupConfirmed === false ||
    foundation.hostingSetupConfirmed === false
  ) {
    return NextResponse.json(
      {
        error:
          "Confirm your domain and hosting path before using Website Builder.",
      },
      { status: 409 }
    );
  }
  const ref = db.doc(`subAccounts/${subAccountId}/agentSites/${SITE_ID}`);
  const snap = await ref.get();

  if (body.templateId && !(body.templateId in AGENT_SITE_TEMPLATES)) {
    return NextResponse.json({ error: "Unknown template." }, { status: 400 });
  }

  if (!snap.exists) {
    // First write — must establish a template.
    const templateId = (body.templateId ?? "") as AgentSiteTemplateId;
    if (!templateId) {
      return NextResponse.json(
        { error: "Pick a template first." },
        { status: 400 }
      );
    }
    const content = { ...emptyAgentSiteContent(), ...(body.content ?? {}) };
    const design: AgentSiteDesign = body.design
      ? applyDesignFields(emptyAgentSiteDesign(), body.design)
      : emptyAgentSiteDesign();
    await ref.set({
      id: SITE_ID,
      agencyId,
      subAccountId,
      createdByUid: uid,
      templateId,
      slug: body.slug
        ? slugify(body.slug)
        : slugify(content.agentName || subAccountId),
      status: "draft",
      content,
      design,
      designerTranscript: [],
      designerStep: 0,
      publishedAt: null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    const fresh = await ref.get();
    return NextResponse.json({ ok: true, site: fresh.data() });
  }

  // Merge update.
  const update: Record<string, unknown> = {
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (body.templateId) update.templateId = body.templateId;
  if (body.slug !== undefined) update.slug = slugify(body.slug);
  if (typeof body.designerStep === "number")
    update.designerStep = body.designerStep;
  if (Array.isArray(body.designerTranscript))
    update.designerTranscript = body.designerTranscript;
  if (body.hydrateFromBlueprint === true) {
    const current = (snap.data()?.content ?? {}) as AgentSiteContent;
    if (isUntouchedAgentSite(current)) {
      const profileSnap = await db
        .doc(`subAccounts/${subAccountId}/businessProfile/main`)
        .get();
      const profile = {
        ...EMPTY_BUSINESS_PROFILE,
        ...(profileSnap.exists
          ? (profileSnap.data() as Partial<BusinessProfileContent>)
          : {}),
      } as BusinessProfileContent;
      const hasBlueprintIdentity = Boolean(
        profile.agentName.trim() ||
        profile.brokerage.trim() ||
        profile.phone.trim() ||
        profile.email.trim() ||
        profile.website.trim()
      );
      if (hasBlueprintIdentity) {
        const hydrated = hydrateAgentSiteFromBlueprint(current, profile);
        update.content = hydrated;
        update.slug = slugify(
          hydrated.agentName || hydrated.brokerage || subAccountId
        );
        update.designerTranscript = [
          {
            role: "designer",
            content:
              "I loaded the approved details from your Business Blueprint. Tell me what you want to change, and I’ll update the private preview beside us.",
          },
        ];
        update.designerStep = 0;
      }
    }
  }
  if (body.content) {
    // Field-level merge so partial content updates don't wipe siblings.
    const current = (snap.data()?.content ?? {}) as AgentSiteContent;
    update.content = { ...current, ...body.content };
  }
  if (body.design) {
    // Re-validated here too (not just in the designer route) — this PATCH
    // endpoint is a second write path onto the same customCss field the
    // renderer trusts as pre-sanitized, so it can never be the gap that
    // lets unscoped CSS through.
    const currentDesign = (snap.data()?.design ?? {}) as AgentSiteDesign;
    update.design = applyDesignFields(currentDesign, body.design);
  }
  if (body.status === "published") {
    update.status = "published";
    update.publishedAt = FieldValue.serverTimestamp();
  } else if (body.status === "draft") {
    update.status = "draft";
  }

  await ref.update(update);
  const fresh = await ref.get();
  return NextResponse.json({ ok: true, site: fresh.data() });
}
