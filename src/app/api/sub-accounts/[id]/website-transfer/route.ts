import "server-only";

import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { getAdminDb } from "@/lib/firebase/admin";
import { scanWebsite } from "@/lib/website-transfer/scanner";

const EMPTY_INVENTORY = {
  pages: 0,
  navigationLinks: [],
  images: [],
  fonts: [],
  colors: [],
  stylesheets: [],
  scripts: [],
  forms: 0,
  tracking: [],
  redirects: [],
  cms: null,
  hosting: null,
  dnsProvider: null,
};

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

function normalizeSource(value: unknown): URL | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(
      /^https?:\/\//i.test(value.trim())
        ? value.trim()
        : `https://${value.trim()}`
    );
    if (!/^https?:$/.test(url.protocol)) return null;
    const host = url.hostname.toLowerCase();
    if (
      host === "localhost" ||
      host === "0.0.0.0" ||
      host === "::1" ||
      /^127\./.test(host) ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^169\.254\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host)
    )
      return null;
    return url;
  } catch {
    return null;
  }
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

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const access = await requireSubAccountAdmin(request, id);
  if (access instanceof NextResponse) return access;
  const body = (await request.json().catch(() => ({}))) as {
    sourceUrl?: unknown;
  };
  const source = normalizeSource(body.sourceUrl);
  if (!source)
    return NextResponse.json(
      { error: "Enter a public website address." },
      { status: 400 }
    );
  const ref = getAdminDb().doc(`subAccounts/${id}/websiteTransfers/current`);
  const now = Timestamp.now();
  const base = {
    id: randomUUID(),
    sourceUrl: source.toString(),
    status: "scanning",
    stage: 2,
    pages: [],
    inventory: EMPTY_INVENTORY,
    error: null,
    privatePreviewPath: null,
    approvedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  await ref.set(base);
  try {
    const report = await scanWebsite(source.toString());
    const complete = {
      ...base,
      ...report,
      status: "preview_ready",
      stage: 5,
      privatePreviewPath: `/sa/${id}/website-transfer-preview`,
      updatedAt: Timestamp.now(),
    };
    await ref.set(complete);
    return NextResponse.json({ transfer: serialize(complete) });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "The read-only scan could not finish.";
    await ref.update({
      status: "error",
      error: message,
      updatedAt: Timestamp.now(),
    });
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const access = await requireSubAccountAdmin(request, id);
  if (access instanceof NextResponse) return access;
  const body = (await request.json().catch(() => ({}))) as { action?: string };
  if (body.action !== "approve")
    return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
  const ref = getAdminDb().doc(`subAccounts/${id}/websiteTransfers/current`);
  const snap = await ref.get();
  if (
    !snap.exists ||
    !["preview_ready", "approved"].includes(String(snap.data()?.status))
  )
    return NextResponse.json(
      { error: "Create and review the private preview first." },
      { status: 409 }
    );
  await ref.update({
    status: "approved",
    stage: 7,
    approvedAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  });
  const updated = await ref.get();
  return NextResponse.json({ transfer: serialize(updated.data()!) });
}
