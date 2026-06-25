import "server-only";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { createTaskServerSide } from "@/lib/server/tasks-service";

/**
 * Dashboard-facing task creation. Replaces the browser's direct Firestore
 * write so `task.created` fires through the shared service. Task edits +
 * deletes have no webhook event and stay client-side.
 */

function str(v: unknown, max = 5000): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function parseDue(v: unknown): Date | null {
  if (typeof v !== "string" || !v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const subAccountId = str(body.subAccountId, 200);
  if (!subAccountId) {
    return NextResponse.json({ error: "subAccountId is required" }, { status: 400 });
  }

  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const title = str(body.title, 200);
  if (!title) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  const subSnap = await getAdminDb().doc(`subAccounts/${subAccountId}`).get();
  const agencyId = (subSnap.data()?.agencyId as string) ?? access.agencyId ?? "";

  const { id, task } = await createTaskServerSide({
    subAccountId,
    agencyId,
    createdByUid: access.uid,
    mode: "live",
    title,
    notes: str(body.notes),
    dueAt: parseDue(body.dueAt),
    contactId: typeof body.contactId === "string" ? body.contactId : null,
    dealId: typeof body.dealId === "string" ? body.dealId : null,
    eventId: typeof body.eventId === "string" ? body.eventId : null,
  });

  return NextResponse.json({ id, task }, { status: 201 });
}
