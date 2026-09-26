import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { getAdminDb } from "@/lib/firebase/admin";
import { normalizePublicUrlString } from "@/lib/net/public-url";
import {
  serializeListingsImportSource,
  syncListingsFromSource,
} from "@/lib/marketing/listings-source-sync";
import type { ListingsImportSourceDoc } from "@/types/listings-import";

export const dynamic = "force-dynamic";

const DOC_PATH = (id: string) => `subAccounts/${id}/listingsImportSource/main`;

/** GET the connected source (or null) — admin-only, same as the rest of Settings. */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const auth = await requireSubAccountAdmin(request, id);
  if (auth instanceof NextResponse) return auth;

  const snap = await getAdminDb().doc(DOC_PATH(id)).get();
  return NextResponse.json({ source: serializeListingsImportSource(snap.data()) });
}

/**
 * Connect (or reconnect) the sub-account's public listings page and run the
 * first sync inline — a single Firecrawl scrape finishes in a few seconds,
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

  const ref = getAdminDb().doc(DOC_PATH(id));
  await ref.set(
    {
      url,
      status: "pending",
      errorMessage: null,
      propertyCount: 0,
      lastSyncedAt: null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    } satisfies Omit<ListingsImportSourceDoc, "createdAt" | "updatedAt" | "lastSyncedAt"> & {
      createdAt: FieldValue;
      updatedAt: FieldValue;
      lastSyncedAt: null;
    },
    { merge: true },
  );

  const result = await syncListingsFromSource(id);
  const snap = await ref.get();
  return NextResponse.json(
    {
      ok: result.ok,
      propertyCount: result.propertyCount,
      error: result.error,
      source: serializeListingsImportSource(snap.data()),
    },
    { status: result.ok ? 200 : 502 },
  );
}

/** Disconnect. Properties already synced stay in the workspace inventory (not deleted). */
export async function DELETE(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const auth = await requireSubAccountAdmin(request, id);
  if (auth instanceof NextResponse) return auth;

  await getAdminDb().doc(DOC_PATH(id)).delete();
  return NextResponse.json({ ok: true });
}
