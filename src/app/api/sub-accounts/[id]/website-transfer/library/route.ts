import "server-only";

import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { getAdminDb } from "@/lib/firebase/admin";

function iso(value: unknown): string | null {
  if (value && typeof value === "object" && "toDate" in value) {
    return (value as { toDate(): Date }).toDate().toISOString();
  }
  return null;
}

export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const access = await requireSubAccountAdmin(request, id);
  if (access instanceof NextResponse) return access;

  const snapshot = await getAdminDb()
    .collection(`subAccounts/${id}/websiteSnapshotLibrary`)
    .orderBy("createdAt", "desc")
    .limit(25)
    .get();
  return NextResponse.json({
    snapshots: snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        sourceUrl: String(data.sourceUrl ?? ""),
        title: String(data.title ?? "Website snapshot"),
        pageCount: Number(data.pageCount ?? 0),
        status: String(data.status ?? "ready"),
        sector: typeof data.sector === "string" ? data.sector : null,
        versionType: String(data.versionType ?? "capture"),
        createdAt: iso(data.createdAt),
      };
    }),
  });
}

const SECTORS = {
  residential: "Residential real estate",
  luxury: "Luxury real estate",
  commercial: "Commercial real estate",
  investor: "Real estate investing",
  property_management: "Property management",
  rentals: "Rentals and leasing",
  new_construction: "New construction",
  brokerage_team: "Brokerage and team",
} as const;

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const access = await requireSubAccountAdmin(request, id);
  if (access instanceof NextResponse) return access;
  const body = (await request.json().catch(() => ({}))) as {
    sector?: unknown;
  };
  const sector = typeof body.sector === "string" ? body.sector : "";
  if (!(sector in SECTORS))
    return NextResponse.json(
      { error: "Choose a real estate sector." },
      { status: 400 }
    );

  const db = getAdminDb();
  const currentRef = db.doc(`subAccounts/${id}/websiteTransfers/current`);
  const [current, pages] = await Promise.all([
    currentRef.get(),
    currentRef.collection("snapshots").orderBy("index").limit(20).get(),
  ]);
  if (!current.exists || pages.empty)
    return NextResponse.json(
      { error: "Capture a website before creating sector versions." },
      { status: 409 }
    );

  const currentData = current.data()!;
  const snapshotId = randomUUID();
  const now = Timestamp.now();
  const label = SECTORS[sector as keyof typeof SECTORS];
  const libraryRef = db.doc(
    `subAccounts/${id}/websiteSnapshotLibrary/${snapshotId}`
  );
  const batch = db.batch();
  batch.set(libraryRef, {
    id: snapshotId,
    sourceUrl: String(currentData.sourceUrl ?? ""),
    title: `${label} version`,
    pageCount: pages.size,
    status: "ready",
    versionType: "sector",
    sector,
    sectorLabel: label,
    designBrief: `Adapt this website for ${label}. Preserve legal accuracy and the approved brand while prioritizing sector-specific navigation, calls to action, services, imagery, and lead capture.`,
    createdAt: now,
    updatedAt: now,
  });
  pages.docs.forEach((page) => {
    batch.set(libraryRef.collection("pages").doc(page.id), {
      ...page.data(),
      updatedAt: now,
    });
  });
  await batch.commit();
  return NextResponse.json({
    snapshot: {
      id: snapshotId,
      sourceUrl: String(currentData.sourceUrl ?? ""),
      title: `${label} version`,
      pageCount: pages.size,
      status: "ready",
      versionType: "sector",
      sector,
      createdAt: now.toDate().toISOString(),
    },
  });
}
