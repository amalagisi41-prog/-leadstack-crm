import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { getAdminDb } from "@/lib/firebase/admin";
import { normalizePublicUrlString } from "@/lib/net/public-url";
import {
  serializeListingsImportSource,
  sourceIdForUrl,
  sourcesCollection,
  syncListingsFromSource,
} from "@/lib/marketing/listings-source-sync";
import type { ListingsImportSourceDoc } from "@/types/listings-import";

export const dynamic = "force-dynamic";

/** List every connected listings page for this sub-account — admin-only, same as the rest of Settings. */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const auth = await requireSubAccountAdmin(request, id);
  if (auth instanceof NextResponse) return auth;

  const snap = await getAdminDb().collection(sourcesCollection(id)).get();
  const sources = snap.docs
    .map((doc) => serializeListingsImportSource(doc.id, doc.data()))
    .filter((s): s is NonNullable<typeof s> => s !== null);
  return NextResponse.json({ sources });
}

/**
 * Connect a new public listings page (or reconnect an already-connected one
 * — the doc id is derived from the URL, so posting the same URL twice
 * updates the existing source instead of adding a duplicate) and run the
 * first sync inline. A single Firecrawl scrape finishes in a few seconds,
 * same convention as the AI Agent's refresh-kb, so there's no need for a
 * QStash round trip on this first, operator-triggered sync.
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const auth = await requireSubAccountAdmin(request, id);
  if (auth instanceof NextResponse) return auth;

  const body = (await request.json().catch(() => ({}))) as { url?: unknown };
  const url = normalizePublicUrlString(body.url);
  if (!url) {
    return NextResponse.json(
      { error: "Enter the full address of the page that lists your properties." },
      { status: 400 },
    );
  }

  const sourceId = sourceIdForUrl(url);
  const ref = getAdminDb().doc(`${sourcesCollection(id)}/${sourceId}`);
  const existing = await ref.get();
  await ref.set(
    {
      url,
      status: "pending",
      errorMessage: null,
      propertyCount: existing.data()?.propertyCount ?? 0,
      lastSyncedAt: existing.data()?.lastSyncedAt ?? null,
      createdAt: existing.exists ? existing.data()?.createdAt : FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    } satisfies Omit<ListingsImportSourceDoc, "createdAt" | "updatedAt" | "lastSyncedAt" | "propertyCount"> & {
      createdAt: FieldValue;
      updatedAt: FieldValue;
      lastSyncedAt: unknown;
      propertyCount: number;
    },
    { merge: true },
  );

  const result = await syncListingsFromSource(id, sourceId);
  const snap = await ref.get();
  return NextResponse.json(
    {
      ok: result.ok,
      propertyCount: result.propertyCount,
      error: result.error,
      source: serializeListingsImportSource(sourceId, snap.data()),
    },
    { status: result.ok ? 200 : 502 },
  );
}
