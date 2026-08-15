import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { getAdminDb } from "@/lib/firebase/admin";
import { normalizeAgentSiteComposition } from "@/lib/website-studio/site-composition";
import { emptyAgentSiteContent } from "@/types/agent-site";

const SITE_ID = "main";

export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const snap = await getAdminDb()
    .collection(`subAccounts/${subAccountId}/agentSites/${SITE_ID}/revisions`)
    .orderBy("createdAt", "desc")
    .limit(30)
    .get();

  return NextResponse.json({
    revisions: snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
  });
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;
  const { uid } = access;

  let body: { revisionId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const revisionId =
    typeof body.revisionId === "string" ? body.revisionId.trim() : "";
  if (!revisionId || !/^[A-Za-z0-9_-]{1,100}$/.test(revisionId)) {
    return NextResponse.json({ error: "Invalid revision." }, { status: 400 });
  }

  const db = getAdminDb();
  const siteRef = db.doc(`subAccounts/${subAccountId}/agentSites/${SITE_ID}`);
  const revisionRef = siteRef.collection("revisions").doc(revisionId);
  const [siteSnap, revisionSnap] = await Promise.all([
    siteRef.get(),
    revisionRef.get(),
  ]);
  if (!siteSnap.exists || !revisionSnap.exists) {
    return NextResponse.json({ error: "Revision not found." }, { status: 404 });
  }

  const current = siteSnap.data() ?? {};
  const revision = revisionSnap.data() ?? {};
  const backupRef = siteRef.collection("revisions").doc();
  const batch = db.batch();
  batch.set(backupRef, {
    id: backupRef.id,
    siteId: SITE_ID,
    subAccountId,
    createdByUid: uid,
    source: "restore",
    label: "Before revision restore",
    templateId: current.templateId,
    slug: current.slug,
    status: current.status,
    content: current.content ?? emptyAgentSiteContent(),
    composition: normalizeAgentSiteComposition(current.composition),
    createdAt: FieldValue.serverTimestamp(),
  });
  batch.update(siteRef, {
    templateId: revision.templateId,
    slug: revision.slug,
    content: revision.content ?? emptyAgentSiteContent(),
    composition: normalizeAgentSiteComposition(revision.composition),
    status: "draft",
    updatedAt: FieldValue.serverTimestamp(),
  });
  await batch.commit();

  const fresh = await siteRef.get();
  return NextResponse.json({ ok: true, site: fresh.data() });
}
