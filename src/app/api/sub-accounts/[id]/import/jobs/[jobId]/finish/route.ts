import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import type { ImportJob } from "@/types/import";

/**
 * Mark an import job finished. Sub-account admin only.
 *
 *   POST .../import/jobs/[jobId]/finish   body: { status?: "completed" | "failed" }
 *
 * Idempotent — finishing an already-finished job is a no-op success.
 */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string; jobId: string }> },
) {
  const { id: subAccountId, jobId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const statusRaw = (body as Record<string, unknown>)?.status;
  const status = statusRaw === "failed" ? "failed" : "completed";

  const db = getAdminDb();
  const jobRef = db.doc(`importJobs/${jobId}`);
  const snap = await jobRef.get();
  if (!snap.exists) {
    return NextResponse.json({ error: "Import job not found" }, { status: 404 });
  }
  const job = snap.data() as ImportJob;
  if (job.subAccountId !== subAccountId) {
    return NextResponse.json({ error: "Import job not found" }, { status: 404 });
  }

  await jobRef.update({
    status,
    finishedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return NextResponse.json({ ok: true, status });
}
