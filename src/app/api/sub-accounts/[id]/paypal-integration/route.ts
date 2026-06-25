import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import type { PayPalConfig } from "@/types";

/**
 * Manage the per-sub-account PayPal connection used for the Products +
 * Invoices payment flow. v1 uses paypal.me links — operator pastes
 * their PayPal.me username and we generate
 * `https://paypal.me/{username}/{amount}{currency}` on invoice send.
 *
 * POST   — connect / update the username. Body: { username }
 *          Validates the username matches PayPal's format (1-20 chars,
 *          alphanumeric + hyphens). Strips a leading paypal.me/ if the
 *          operator pasted a full URL.
 *
 * DELETE — disconnect (clears the config).
 *
 * No HTTP roundtrip to paypal.me to validate the username — that endpoint
 * is rate-limited and unreliable for sub-resource checks. The first sent
 * invoice surfaces a wrong username via the recipient seeing a "no such
 * paypal.me account" page.
 */

const USERNAME_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,18}[A-Za-z0-9])?$/;

interface PostBody {
  username?: string;
}

function normaliseUsername(raw: string): string {
  return raw
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^(www\.)?paypal\.me\//i, "")
    .replace(/^\//, "")
    .replace(/\/+$/, "");
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

  const username = normaliseUsername(body.username ?? "");
  if (!username) {
    return NextResponse.json(
      { error: "PayPal.me username is required." },
      { status: 400 },
    );
  }
  if (!USERNAME_RE.test(username)) {
    return NextResponse.json(
      {
        error:
          "PayPal.me usernames are 1-20 characters, letters / digits / hyphens, can't start or end with a hyphen.",
      },
      { status: 400 },
    );
  }

  const cfg: PayPalConfig = {
    username,
    connectedAt: new Date(),
  };
  await getAdminDb()
    .doc(`subAccounts/${subAccountId}`)
    .set(
      {
        paypalConfig: cfg,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

  return NextResponse.json({
    ok: true,
    username,
    paypalMeUrl: `https://paypal.me/${username}`,
  });
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
        paypalConfig: null,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

  return NextResponse.json({ ok: true });
}
