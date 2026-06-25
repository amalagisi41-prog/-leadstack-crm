import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import {
  requireSubAccountAdmin,
  requireSubAccountMember,
} from "@/lib/auth/require-tenancy";
import type { ImportJob, ImportSource } from "@/types/import";

/**
 * Import jobs — the parent record for a bulk migration run.
 *
 * GET  — list recent jobs (member-readable; the Imports UI also streams these
 *        over the client SDK).
 * POST — create a job. Sub-account admin only. The importer then streams
 *        records through .../jobs/[jobId]/chunk and calls .../finish.
 */

const VALID_SOURCES: ImportSource[] = ["csv", "ghl", "api"];

export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const snap = await getAdminDb()
    .collection("importJobs")
    .where("subAccountId", "==", subAccountId)
    .get();
  const jobs = snap.docs.map(
    (d) => ({ id: d.id, ...(d.data() as Omit<ImportJob, "id">) }),
  );
  return NextResponse.json({ ok: true, jobs });
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const sourceRaw = (body as Record<string, unknown>)?.source;
  const source: ImportSource = VALID_SOURCES.includes(sourceRaw as ImportSource)
    ? (sourceRaw as ImportSource)
    : "api";

  const db = getAdminDb();
  const subSnap = await db.doc(`subAccounts/${subAccountId}`).get();
  if (!subSnap.exists) {
    return NextResponse.json({ error: "Sub-account not found" }, { status: 404 });
  }
  const agencyId = (subSnap.data()?.agencyId as string | undefined) ?? null;
  if (!agencyId) {
    return NextResponse.json(
      { error: "Sub-account is missing tenancy metadata." },
      { status: 500 },
    );
  }

  const ref = db.collection("importJobs").doc();
  const now = FieldValue.serverTimestamp();
  const job: Omit<ImportJob, "id"> = {
    agencyId,
    subAccountId,
    createdByUid: access.uid,
    source,
    status: "running",
    totals: {},
    errors: [],
    createdAt: now,
    updatedAt: now,
    finishedAt: null,
  };
  await ref.set(job);

  return NextResponse.json({ ok: true, jobId: ref.id });
}
