import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import type { AgentSiteDoc } from "@/types/agent-site";
import { assessAgentSiteReleaseAssurance } from "@/lib/website-studio/release-assurance";
import { releaseFingerprint } from "@/lib/website-studio/release-fingerprint";

async function buildReport(subAccountId: string) {
  const db = getAdminDb();
  const ref = db.doc(`subAccounts/${subAccountId}/agentSites/main`);
  const [siteSnap, accountSnap, revisionsSnap] = await Promise.all([
    ref.get(),
    db.doc(`subAccounts/${subAccountId}`).get(),
    ref.collection("revisions").limit(1).get(),
  ]);
  if (!siteSnap.exists) return null;
  const site = siteSnap.data() as AgentSiteDoc;
  const account = accountSnap.data();
  const report = assessAgentSiteReleaseAssurance({
    content: site.content,
    composition: site.composition,
    slug: site.slug,
    idxConnected: Boolean(
      account?.idxEnabledByAgency === true && account?.idxConfig?.enabled
    ),
    hasRollbackRevision: !revisionsSnap.empty,
  });
  return {
    ref,
    site,
    report,
    fingerprint: releaseFingerprint(
      site.content,
      site.composition,
      site.design
    ),
  };
}

export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const access = await requireSubAccountAdmin(request, id);
  if (access instanceof NextResponse) return access;
  const candidate = await buildReport(id);
  if (!candidate)
    return NextResponse.json(
      { error: "Create a website draft first." },
      { status: 404 }
    );
  return NextResponse.json({
    report: candidate.report,
    fingerprint: candidate.fingerprint,
    approved:
      candidate.site.releaseAssurance?.passed === true &&
      candidate.site.releaseAssurance.fingerprint === candidate.fingerprint,
  });
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const access = await requireSubAccountAdmin(request, id);
  if (access instanceof NextResponse) return access;
  const candidate = await buildReport(id);
  if (!candidate)
    return NextResponse.json(
      { error: "Create a website draft first." },
      { status: 404 }
    );
  if (!candidate.report.passed)
    return NextResponse.json(
      {
        error: "Release assurance found blocking issues.",
        report: candidate.report,
      },
      { status: 409 }
    );
  const warningCount = candidate.report.checks.filter(
    (check) => check.status === "warning"
  ).length;
  await candidate.ref.update({
    releaseAssurance: {
      fingerprint: candidate.fingerprint,
      passed: true,
      blockerCount: 0,
      warningCount,
      approvedByUid: access.uid,
      approvedAt: FieldValue.serverTimestamp(),
    },
    updatedAt: FieldValue.serverTimestamp(),
  });
  return NextResponse.json({
    ok: true,
    approved: true,
    report: candidate.report,
    fingerprint: candidate.fingerprint,
  });
}
