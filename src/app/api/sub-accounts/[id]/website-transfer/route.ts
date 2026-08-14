import "server-only";

import { randomUUID } from "crypto";
import { gzipSync } from "node:zlib";
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

function compressSnapshot(html: string): string {
  let source = html;
  let compressed = gzipSync(source).toString("base64");
  while (compressed.length > 800_000 && source.length > 100_000) {
    source = source.slice(0, Math.floor(source.length * 0.75));
    compressed = gzipSync(source).toString("base64");
  }
  return compressed;
}

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
    snapshotVersion: 2,
    sourceUrl: source.toString(),
    status: "scanning",
    stage: 2,
    pages: [],
    inventory: EMPTY_INVENTORY,
    error: null,
    privatePreviewPath: null,
    approvedAt: null,
    hostingStatus: "not_requested",
    hostingRequestedAt: null,
    hostingUrl: null,
    createdAt: now,
    updatedAt: now,
  };
  await ref.set(base);
  try {
    const report = await scanWebsite(source.toString());
    const pages = report.pages.map((page) => {
      const metadata = { ...page };
      delete metadata.snapshotHtml;
      return metadata;
    });
    const complete = {
      ...base,
      pages,
      inventory: report.inventory,
      status: "preview_ready",
      stage: 5,
      privatePreviewPath: `/sa/${id}/website-transfer-preview`,
      updatedAt: Timestamp.now(),
    };
    const db = getAdminDb();
    const batch = db.batch();
    batch.set(ref, complete);
    const libraryRef = db.doc(
      `subAccounts/${id}/websiteSnapshotLibrary/${base.id}`
    );
    batch.set(libraryRef, {
      id: base.id,
      sourceUrl: complete.sourceUrl,
      title: report.pages[0]?.title || new URL(complete.sourceUrl).hostname,
      pageCount: pages.filter((page) => page.status !== "cannot_access").length,
      status: "ready",
      createdAt: now,
      updatedAt: complete.updatedAt,
    });
    report.pages.forEach((page, index) => {
      if (!page.snapshotHtml) return;
      const snapshotPage = {
        index,
        url: page.url,
        path: page.path,
        title: page.title,
        htmlGzip: compressSnapshot(page.snapshotHtml),
        updatedAt: Timestamp.now(),
      };
      batch.set(ref.collection("snapshots").doc(String(index)), snapshotPage);
      batch.set(
        libraryRef.collection("pages").doc(String(index)),
        snapshotPage
      );
    });
    await batch.commit();
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
  if (!body.action || !["approve", "request_hosting"].includes(body.action))
    return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
  const ref = getAdminDb().doc(`subAccounts/${id}/websiteTransfers/current`);
  const snap = await ref.get();
  if (!snap.exists)
    return NextResponse.json(
      { error: "Create and review the private preview first." },
      { status: 409 }
    );
  if (body.action === "request_hosting") {
    if (snap.data()?.status !== "approved")
      return NextResponse.json(
        { error: "Approve the private replacement before requesting hosting." },
        { status: 409 }
      );
    const now = Timestamp.now();
    const db = getAdminDb();
    const batch = db.batch();
    batch.update(ref, {
      hostingStatus: "requested",
      hostingRequestedAt: now,
      updatedAt: now,
    });
    batch.update(db.doc(`subAccounts/${id}`), {
      "onboardingFoundation.completed": true,
      "onboardingFoundation.mode": "transfer",
      "onboardingFoundation.sourceUrl": snap.data()?.sourceUrl ?? "",
      "onboardingFoundation.domainStartingPoint": "have_domain",
      "onboardingFoundation.domainSetupConfirmed": true,
      "onboardingFoundation.hostingStartingPoint": "agentstack_managed",
      "onboardingFoundation.hostingSetupConfirmed": true,
      "onboardingFoundation.updatedAt": now,
      updatedAt: now,
    });
    await batch.commit();
    const updated = await ref.get();
    return NextResponse.json({ transfer: serialize(updated.data()!) });
  }
  if (!["preview_ready", "approved"].includes(String(snap.data()?.status)))
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
