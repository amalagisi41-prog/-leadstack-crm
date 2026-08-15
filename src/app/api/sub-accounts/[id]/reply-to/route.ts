import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";

/**
 * PATCH /api/sub-accounts/[id]/reply-to
 *
 * Saves (or clears) the sub-account's Reply-To address. Admin only.
 * Body: { replyToEmail: string | null }.
 *
 * Why this route exists: `replyToEmail` was initialized to null at
 * sub-account creation and no UI or endpoint could ever set it, yet
 * `resend/route.ts` and `resend/verify/route.ts` both hard-block on it.
 * That made the dedicated email sending domain — and therefore the
 * "Verify your business email" site-health item — unreachable for every
 * tenant. The old error text pointed at an "Automations settings page"
 * that never existed.
 */

// Deliberately permissive: this only needs to be a deliverable mailbox the
// operator controls, and over-strict local-part rules reject valid addresses.
const EMAIL_RE = /^[^\s@]+@[^\s@.]+\.[^\s@]+$/;

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;

  let body: { replyToEmail?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  let replyToEmail: string | null;
  if (body.replyToEmail === null || body.replyToEmail === "") {
    replyToEmail = null;
  } else if (typeof body.replyToEmail !== "string") {
    return NextResponse.json(
      { error: "replyToEmail must be a string or null." },
      { status: 400 },
    );
  } else {
    const normalized = body.replyToEmail.trim().toLowerCase();
    if (!EMAIL_RE.test(normalized)) {
      return NextResponse.json(
        { error: "Enter a valid email address, like you@yourbrokerage.com." },
        { status: 400 },
      );
    }
    replyToEmail = normalized;
  }

  await getAdminDb().doc(`subAccounts/${subAccountId}`).update({
    replyToEmail,
    updatedAt: FieldValue.serverTimestamp(),
  });

  return NextResponse.json({ ok: true, replyToEmail });
}
