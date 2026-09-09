import "server-only";

import { NextResponse } from "next/server";
import {
  deleteIdxSecrets,
  loadIdxSecrets,
  writeIdxSecrets,
} from "@/lib/comms/sub-account-secrets";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { fetchApprovedMlsIds } from "@/lib/idx/broker-client";
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

export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const subSnap = await getAdminDb().doc(`subAccounts/${subAccountId}`).get();
  if (!subSnap.exists) {
    return NextResponse.json({ error: "Sub-account not found" }, { status: 404 });
  }
  if (subSnap.data()?.idxEnabledByAgency !== true) {
    return NextResponse.json({ error: "IDX Listings is disabled for this sub-account." }, { status: 403 });
  }

  const cfg = subSnap.data()?.idxConfig as IdxConfig | null | undefined;
  const secrets = await loadIdxSecrets(subAccountId);
  if (!cfg?.connected || !secrets) {
    return NextResponse.json({ ok: true, approvedMlsIds: [], configuredMlsId: null });
  }

  try {
    const approvedMlsIds = await fetchApprovedMlsIds(secrets.accessKey);
    return NextResponse.json({ ok: true, approvedMlsIds, configuredMlsId: cfg.mlsId ?? null });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load approved MLS feeds." },
      { status: 502 },
    );
  }
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

  const existing = subSnap.data()?.idxConfig as IdxConfig | null | undefined;
  const accessKey = (body.accessKey ?? "").trim();
  if (!accessKey && !existing?.connected) {
    return NextResponse.json(
      { error: "IDX Broker access key is required." },
      { status: 400 },
    );
  }
  const secrets = accessKey ? { accessKey } : await loadIdxSecrets(subAccountId);
  if (!secrets?.accessKey) {
    return NextResponse.json({ error: "IDX Broker access key is unavailable. Reconnect IDX Broker." }, { status: 400 });
  }

  let approvedMlsIds: string[];
  try {
    approvedMlsIds = await fetchApprovedMlsIds(secrets.accessKey);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not verify the IDX Broker account." },
      { status: 502 },
    );
  }
  const requestedMlsId = body.mlsId?.trim() || null;
  if (requestedMlsId && !approvedMlsIds.includes(requestedMlsId)) {
    return NextResponse.json(
      { error: "That is not an approved MLS feed ID for this IDX Broker account. Choose an approved feed from the list.", approvedMlsIds },
      { status: 400 },
    );
  }
  const mlsId = requestedMlsId ?? (approvedMlsIds.length === 1 ? approvedMlsIds[0] : null);

  // Credential first. A crash between the two writes then leaves an unreferenced
  // secret rather than a config claiming a connection with no key behind it.
  if (accessKey) {
    await writeIdxSecrets(subAccountId, { accessKey });
  }

  const cfg: IdxConfig = {
    enabled: true,
    connected: true,
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

  return NextResponse.json({ ok: true, approvedMlsIds, mlsId });
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
  // Otherwise the IDX Broker key outlives the connection that justified it.
  await deleteIdxSecrets(subAccountId);

  return NextResponse.json({ ok: true });
}
