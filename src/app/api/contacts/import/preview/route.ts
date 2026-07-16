import "server-only";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";

const MAX_ROWS = 5000;

function str(v: unknown, max = 500): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function normalizeEmail(value: string): string | null {
  const next = value.trim().toLowerCase();
  return next || null;
}

function normalizePhone(value: string): string | null {
  const digits = value.replace(/\D/g, "");
  return digits || null;
}

interface PreviewRowInput {
  name?: string;
  email?: string;
  phone?: string;
  __rowNumber?: number;
}

type DuplicateReason =
  | "Duplicate email already exists in this workspace"
  | "Duplicate phone already exists in this workspace"
  | "Duplicate email also appears elsewhere in this CSV"
  | "Duplicate phone also appears elsewhere in this CSV";

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
    ? (body.contacts as PreviewRowInput[])
    : [];
  if (rows.length === 0) {
    return NextResponse.json({
      ok: true,
      readyIndexes: [],
      skipped: [],
      summary: {
        readyCount: 0,
        duplicateCount: 0,
        existingDuplicateCount: 0,
        fileDuplicateCount: 0,
      },
    });
  }
  if (rows.length > MAX_ROWS) {
    return NextResponse.json(
      { error: `Preview at most ${MAX_ROWS} rows at a time.` },
      { status: 400 },
    );
  }

  const existingSnap = await getAdminDb()
    .collection("contacts")
    .where("subAccountId", "==", subAccountId)
    .get();

  const existingEmailSet = new Set<string>();
  const existingPhoneSet = new Set<string>();
  for (const doc of existingSnap.docs) {
    const email = normalizeEmail(str(doc.get("email")));
    const phone = normalizePhone(str(doc.get("phone")));
    if (email) existingEmailSet.add(email);
    if (phone) existingPhoneSet.add(phone);
  }

  const seenEmailIndex = new Map<string, number>();
  const seenPhoneIndex = new Map<string, number>();
  const readyIndexes: number[] = [];
  const skipped: Array<{
    index: number;
    rowNumber: number;
    reason: DuplicateReason;
  }> = [];
  let existingDuplicateCount = 0;
  let fileDuplicateCount = 0;

  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    const email = normalizeEmail(str(row.email));
    const phone = normalizePhone(str(row.phone));
    const rowNumber =
      typeof row.__rowNumber === "number" && Number.isFinite(row.__rowNumber)
        ? row.__rowNumber
        : index + 2;

    let reason: DuplicateReason | null = null;

    if (email && existingEmailSet.has(email)) {
      reason = "Duplicate email already exists in this workspace";
      existingDuplicateCount++;
    } else if (phone && existingPhoneSet.has(phone)) {
      reason = "Duplicate phone already exists in this workspace";
      existingDuplicateCount++;
    } else if (email && seenEmailIndex.has(email)) {
      reason = "Duplicate email also appears elsewhere in this CSV";
      fileDuplicateCount++;
    } else if (phone && seenPhoneIndex.has(phone)) {
      reason = "Duplicate phone also appears elsewhere in this CSV";
      fileDuplicateCount++;
    }

    if (reason) {
      skipped.push({ index, rowNumber, reason });
      continue;
    }

    if (email) seenEmailIndex.set(email, index);
    if (phone) seenPhoneIndex.set(phone, index);
    readyIndexes.push(index);
  }

  return NextResponse.json({
    ok: true,
    readyIndexes,
    skipped,
    summary: {
      readyCount: readyIndexes.length,
      duplicateCount: skipped.length,
      existingDuplicateCount,
      fileDuplicateCount,
    },
  });
}
