import "server-only";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { createContactServerSide } from "@/lib/server/contacts-service";

/**
 * Dashboard-facing contact creation. The "Add contact" modal used to write
 * straight to Firestore from the browser (no server code → no webhook).
 * It now POSTs here so the create runs server-side and fires
 * `contact.created` through the shared service.
 *
 * Auth: any active member of the sub-account (collaborators included —
 * matches the Firestore rule that let members create contacts directly).
 */

function str(v: unknown, max = 500): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function strArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((t): t is string => typeof t === "string")
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 50);
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

  const name = str(body.name, 200);
  const email = str(body.email);
  if (!name && !email) {
    return NextResponse.json(
      { error: "Provide at least a name or an email." },
      { status: 400 },
    );
  }

  // The sub-account doc is the source of truth for which agency to stamp.
  const subSnap = await getAdminDb().doc(`subAccounts/${subAccountId}`).get();
  const agencyId = (subSnap.data()?.agencyId as string) ?? access.agencyId ?? "";

  const { id, contact } = await createContactServerSide({
    subAccountId,
    agencyId,
    createdByUid: access.uid,
    // Dashboard writes are always live data — test-mode contacts only
    // come through the public API with a `lsk_test_*` key.
    mode: "live",
    name,
    email,
    phone: str(body.phone),
    company: str(body.company),
    address: str(body.address),
    source: str(body.source),
    tags: strArray(body.tags),
    territoryId: typeof body.territoryId === "string" ? body.territoryId : null,
  });

  return NextResponse.json({ id, contact }, { status: 201 });
}
