import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import {
  websiteStudioGateOpen,
  WEBSITE_STUDIO_LOCKED_MESSAGE,
} from "@/lib/website-studio/gate";
import type { FunnelContent } from "@/types/funnel";

/**
 * A single funnel.
 *
 * GET    — fetch the funnel doc.
 * PATCH  — update name / slug / content / status (publish or unpublish).
 * DELETE — remove the funnel (its public link then 404s).
 */

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "funnel"
  );
}

async function guard(request: Request, subAccountId: string) {
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;
  if (!(await websiteStudioGateOpen(subAccountId))) {
    return NextResponse.json(
      { error: WEBSITE_STUDIO_LOCKED_MESSAGE },
      { status: 403 },
    );
  }
  return access;
}

export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string; funnelId: string }> },
) {
  const { id: subAccountId, funnelId } = await ctx.params;
  const access = await guard(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const snap = await getAdminDb()
    .doc(`subAccounts/${subAccountId}/funnels/${funnelId}`)
    .get();
  if (!snap.exists) {
    return NextResponse.json({ error: "Funnel not found" }, { status: 404 });
  }
  return NextResponse.json({ funnel: snap.data() });
}

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string; funnelId: string }> },
) {
  const { id: subAccountId, funnelId } = await ctx.params;
  const access = await guard(request, subAccountId);
  if (access instanceof NextResponse) return access;

  let body: {
    name?: string;
    slug?: string;
    content?: Partial<FunnelContent>;
    status?: "draft" | "published";
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const db = getAdminDb();
  const ref = db.doc(`subAccounts/${subAccountId}/funnels/${funnelId}`);
  const snap = await ref.get();
  if (!snap.exists) {
    return NextResponse.json({ error: "Funnel not found" }, { status: 404 });
  }

  const update: Record<string, unknown> = {
    updatedAt: FieldValue.serverTimestamp(),
  };

  if (typeof body.name === "string") {
    update.name = body.name.trim().slice(0, 80) || "Untitled funnel";
  }

  if (typeof body.slug === "string") {
    const nextSlug = slugify(body.slug);
    // Enforce uniqueness within the sub-account (ignore self).
    const dupe = await db
      .collection(`subAccounts/${subAccountId}/funnels`)
      .where("slug", "==", nextSlug)
      .limit(1)
      .get();
    if (!dupe.empty && dupe.docs[0].id !== funnelId) {
      return NextResponse.json(
        { error: "That link name is already used by another funnel." },
        { status: 409 },
      );
    }
    update.slug = nextSlug;
  }

  if (body.content) {
    const current = (snap.data()?.content ?? {}) as FunnelContent;
    // Field-level merge so a partial content patch never wipes siblings.
    const merged: FunnelContent = { ...current, ...body.content };
    // Keep benefits an array of trimmed non-empty-ish strings (cap length).
    if (Array.isArray(body.content.benefits)) {
      merged.benefits = body.content.benefits
        .map((b) => (typeof b === "string" ? b : ""))
        .slice(0, 6);
    }
    update.content = merged;
  }

  if (body.status === "published") {
    update.status = "published";
    if (!snap.data()?.publishedAt) {
      update.publishedAt = FieldValue.serverTimestamp();
    }
  } else if (body.status === "draft") {
    update.status = "draft";
  }

  await ref.update(update);
  const fresh = await ref.get();
  return NextResponse.json({ ok: true, funnel: fresh.data() });
}

export async function DELETE(
  request: Request,
  ctx: { params: Promise<{ id: string; funnelId: string }> },
) {
  const { id: subAccountId, funnelId } = await ctx.params;
  const access = await guard(request, subAccountId);
  if (access instanceof NextResponse) return access;

  await getAdminDb()
    .doc(`subAccounts/${subAccountId}/funnels/${funnelId}`)
    .delete();
  return NextResponse.json({ ok: true });
}
