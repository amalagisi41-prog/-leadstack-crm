import "server-only";

import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { getAdminDb } from "@/lib/firebase/admin";
import { normalizePublicUrl } from "@/lib/net/public-url";

function serialize(data: Record<string, unknown>) {
  const convert = (value: unknown): unknown =>
    value instanceof Timestamp
      ? value.toDate().toISOString()
      : Array.isArray(value)
        ? value.map(convert)
        : value && typeof value === "object"
          ? Object.fromEntries(
              Object.entries(value as Record<string, unknown>).map(
                ([key, item]) => [key, convert(item)]
              )
            )
          : value;
  return convert(data);
}

export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const access = await requireSubAccountAdmin(request, id);
  if (access instanceof NextResponse) return access;
  const snap = await getAdminDb()
    .doc(`subAccounts/${id}/websiteTransfers/current`)
    .get();
  return NextResponse.json({
    transfer: snap.exists ? serialize(snap.data()!) : null,
  });
}

/**
 * Saves a resumable migration intent only. AgentStack deliberately does not
 * proxy, scan, or execute the external website. Provider transfer status is
 * attached to this record in the guided Website & Domain workflow.
 */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const access = await requireSubAccountAdmin(request, id);
  if (access instanceof NextResponse) return access;
  const body = (await request.json().catch(() => ({}))) as {
    sourceUrl?: unknown;
    sourcePlatform?: unknown;
  };
  const source = normalizePublicUrl(body.sourceUrl);
  if (!source) {
    return NextResponse.json(
      { error: "Enter the public address of your current website." },
      { status: 400 }
    );
  }

  const now = Timestamp.now();
  const transfer = {
    id: randomUUID(),
    sourceUrl: source.toString(),
    sourcePlatform:
      typeof body.sourcePlatform === "string"
        ? body.sourcePlatform.slice(0, 50)
        : "other",
    status: "setup_required",
    stage: 1,
    provider: null,
    providerStatus: "not_started",
    hostingStatus: "not_requested",
    hostingRequestedAt: null,
    hostingUrl: null,
    error: null,
    createdAt: now,
    updatedAt: now,
  };
  await getAdminDb()
    .doc(`subAccounts/${id}/websiteTransfers/current`)
    .set(transfer);
  return NextResponse.json({ transfer: serialize(transfer) });
}

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const access = await requireSubAccountAdmin(request, id);
  if (access instanceof NextResponse) return access;
  const body = (await request.json().catch(() => ({}))) as { action?: string };
  if (body.action !== "request_hosting") {
    return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
  }

  const db = getAdminDb();
  const ref = db.doc(`subAccounts/${id}/websiteTransfers/current`);
  const snap = await ref.get();
  if (!snap.exists) {
    return NextResponse.json(
      { error: "Save your current website address first." },
      { status: 409 }
    );
  }

  const now = Timestamp.now();
  const batch = db.batch();
  batch.update(ref, {
    status: "transfer_requested",
    stage: 2,
    hostingStatus: "requested",
    hostingRequestedAt: now,
    updatedAt: now,
  });
  batch.update(db.doc(`subAccounts/${id}`), {
    "onboardingFoundation.completed": false,
    "onboardingFoundation.mode": "transfer",
    "onboardingFoundation.sourceUrl": snap.data()?.sourceUrl ?? "",
    "onboardingFoundation.domainStartingPoint": "have_domain",
    "onboardingFoundation.hostingStartingPoint": "transfer_existing",
    "onboardingFoundation.hostingSetupConfirmed": false,
    "onboardingFoundation.updatedAt": now,
    updatedAt: now,
  });
  await batch.commit();
  const updated = await ref.get();
  return NextResponse.json({ transfer: serialize(updated.data()!) });
}
