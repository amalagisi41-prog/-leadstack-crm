import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import type { PaymentPortalConfig } from "@/types";

/**
 * Manage the per-sub-account payment portal link. Provider-agnostic: the
 * operator pastes a link to whatever payment portal they already use
 * (PayPal.me, Venmo, Square, a Stripe Payment Link, a bank's own pay page,
 * etc) instead of the app integrating with one specific provider. See
 * `PaymentPortalConfig` in `types/tenancy.ts`.
 *
 * POST   — connect / update the link. Body: { url, label? }
 *          Validates `url` is a well-formed https URL — nothing
 *          provider-specific, since any payment portal is allowed.
 *
 * DELETE — disconnect (clears the config).
 */

interface PostBody {
  url?: string;
  label?: string | null;
}

function normaliseUrl(raw: string): string {
  const trimmed = raw.trim();
  // A bare domain/username someone pastes without a scheme still resolves
  // fine as https — don't reject it for a missing "https://".
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;

  let body: PostBody;
  try {
    body = (await request.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const raw = (body.url ?? "").trim();
  if (!raw) {
    return NextResponse.json(
      { error: "A payment portal link is required." },
      { status: 400 },
    );
  }
  const url = normaliseUrl(raw);
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return NextResponse.json(
      { error: "That doesn't look like a valid URL." },
      { status: 400 },
    );
  }
  if (parsed.protocol !== "https:") {
    return NextResponse.json(
      { error: "The payment portal link must be an https:// URL." },
      { status: 400 },
    );
  }

  const label = body.label?.trim() || null;
  if (label && label.length > 40) {
    return NextResponse.json(
      { error: "Label must be 40 characters or fewer." },
      { status: 400 },
    );
  }

  const cfg: PaymentPortalConfig = {
    url: parsed.toString(),
    label,
    connectedAt: new Date(),
  };
  await getAdminDb()
    .doc(`subAccounts/${subAccountId}`)
    .set(
      {
        paymentPortalConfig: cfg,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

  return NextResponse.json({ ok: true, url: cfg.url, label: cfg.label });
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
      {
        paymentPortalConfig: null,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

  return NextResponse.json({ ok: true });
}
