import "server-only";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { createContactServerSide } from "@/lib/server/contacts-service";

/**
 * Dashboard-facing CSV import. The client parses + maps + validates the CSV
 * locally, then POSTs the valid rows here in chunks (the caller bounds each
 * request to MAX_ROWS so a big import can't time out). Each created contact
 * fires its own `contact.created` — same as a manual add — per the "one
 * event per row" import policy.
 */

const MAX_ROWS = 500;

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

  const rows = Array.isArray(body.contacts)
    ? (body.contacts as Record<string, unknown>[])
    : [];
  if (rows.length === 0) {
    return NextResponse.json({ created: 0, errors: [] });
  }
  if (rows.length > MAX_ROWS) {
    return NextResponse.json(
      { error: `Send at most ${MAX_ROWS} rows per request.` },
      { status: 400 },
    );
  }

  const subSnap = await getAdminDb().doc(`subAccounts/${subAccountId}`).get();
  const agencyId = (subSnap.data()?.agencyId as string) ?? access.agencyId ?? "";

  let created = 0;
  const errors: { index: number; message: string }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const name = str(row.name, 200);
    const email = str(row.email);
    if (!name && !email) {
      errors.push({ index: i, message: "Missing name and email" });
      continue;
    }
    try {
      await createContactServerSide({
        subAccountId,
        agencyId,
        createdByUid: access.uid,
        mode: "live",
        name,
        email,
        phone: str(row.phone),
        company: str(row.company),
        address: str(row.address),
        source: str(row.source),
        tags: strArray(row.tags),
        territoryId: typeof row.territoryId === "string" ? row.territoryId : null,
      });
      created++;
    } catch (err) {
      errors.push({
        index: i,
        message: err instanceof Error ? err.message : "Failed to save",
      });
    }
  }

  return NextResponse.json({ created, errors });
}
