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
import {
  emptyAgentSiteContent,
  type AgentSiteContent,
  type AgentSiteTemplateId,
} from "@/types/agent-site";

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
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;

  if (!(await websiteStudioGateOpen(subAccountId))) {
    return NextResponse.json({ error: WEBSITE_STUDIO_LOCKED_MESSAGE }, { status: 403 });
  }

  const snap = await getAdminDb()
    .doc(`subAccounts/${subAccountId}/agentSites/${SITE_ID}`)
    .get();

  return NextResponse.json({ site: snap.exists ? snap.data() : null });
}

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;
  const { uid, agencyId } = access;
  if (!agencyId) {
    return NextResponse.json({ error: "Agency not found" }, { status: 400 });
  }

  if (!(await websiteStudioGateOpen(subAccountId))) {
    return NextResponse.json({ error: WEBSITE_STUDIO_LOCKED_MESSAGE }, { status: 403 });
  }

  let body: {
    templateId?: string;
    content?: Partial<AgentSiteContent>;
    status?: "draft" | "published";
    slug?: string;
    designerStep?: number;
    designerTranscript?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const db = getAdminDb();
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
        { status: 400 },
      );
    }
    const content = { ...emptyAgentSiteContent(), ...(body.content ?? {}) };
    await ref.set({
      id: SITE_ID,
      agencyId,
      subAccountId,
      createdByUid: uid,
      templateId,
      slug: body.slug ? slugify(body.slug) : slugify(content.agentName || subAccountId),
      status: "draft",
      content,
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
  if (typeof body.designerStep === "number") update.designerStep = body.designerStep;
  if (Array.isArray(body.designerTranscript)) update.designerTranscript = body.designerTranscript;
  if (body.content) {
    // Field-level merge so partial content updates don't wipe siblings.
    const current = (snap.data()?.content ?? {}) as AgentSiteContent;
    update.content = { ...current, ...body.content };
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
