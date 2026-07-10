import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import type { IdxConfig } from "@/types";

/**
 * Manage the per-sub-account IDX Broker connection. The realtor pastes their
 * own IDX Broker Platinum API access key (Account → API Access in their IDX
 * Broker dashboard) + optionally the id of one approved MLS if their account
 * has more than one. See "IDX Listings (IDX Broker) v1".
 *
 * POST   — connect / update the access key + mlsId.
 * DELETE — disconnect (clears the config; synced listings are left in place
 *          but stop refreshing until reconnected).
 *
 * Both require the agency `idxEnabledByAgency` gate to be on — this mirrors
 * every other agency-gated integration (Meta, WhatsApp, etc).
 */

interface PostBody {
  accessKey?: string;
  mlsId?: string | null;
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const db = getAdminDb();
  const subRef = db.doc(`subAccounts/${subAccountId}`);
  const subSnap = await subRef.get();
  if (!subSnap.exists) {
    return NextResponse.json(
      { error: "Sub-account not found" },
      { status: 404 },
    );
  }
  if (subSnap.data()?.idxEnabledByAgency !== true) {
    return NextResponse.json(
      {
        error:
          "IDX Listings is disabled for this sub-account. Your agency administrator can enable it from Manage in the agency sub-accounts list.",
      },
      { status: 403 },
    );
  }

  let body: PostBody;
  try {
    body = (await request.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const accessKey = (body.accessKey ?? "").trim();
  if (!accessKey) {
    return NextResponse.json(
      { error: "IDX Broker access key is required." },
      { status: 400 },
    );
  }
  const mlsId = body.mlsId?.trim() || null;

  const existing = subSnap.data()?.idxConfig as IdxConfig | null | undefined;
  const cfg: IdxConfig = {
    enabled: true,
    accessKey,
    mlsId,
    displayName: existing?.displayName ?? null,
    lastSyncAt: existing?.lastSyncAt ?? null,
    lastSyncStatus: existing?.lastSyncStatus ?? "idle",
    lastSyncError: null,
    listingCount: existing?.listingCount ?? 0,
  };

  await subRef.set(
    { idxConfig: cfg, updatedAt: FieldValue.serverTimestamp() },
    { merge: true },
  );

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;

  await getAdminDb()
    .doc(`subAccounts/${subAccountId}`)
    .set(
      { idxConfig: null, updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );

  return NextResponse.json({ ok: true });
}
