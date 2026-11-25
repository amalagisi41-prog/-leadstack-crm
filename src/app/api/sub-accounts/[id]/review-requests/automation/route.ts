import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { MAX_REVIEW_DELAY_DAYS, type ReviewAutomationMode } from "@/types/review-requests";

const MODES: ReadonlySet<ReviewAutomationMode> = new Set(["off", "log_only", "live"]);

/**
 * PATCH /api/sub-accounts/[id]/review-requests/automation
 * { mode?: "off" | "log_only" | "live", delayDaysAfterClosing?: number }
 *
 * The post-closing review automation's setting. Admin-only. Independent of
 * the review link so Log only works (and logs why it would fail) before a
 * link is set up. Written with dotted paths so the rest of the Google-review
 * config is untouched.
 */
export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const access = await requireSubAccountAdmin(request, id);
  if (access instanceof NextResponse) return access;
  const body = (await request.json().catch(() => null)) as
    | { mode?: string; delayDaysAfterClosing?: number }
    | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });

  const update: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
  if (body.mode !== undefined) {
    if (!MODES.has(body.mode as ReviewAutomationMode)) {
      return NextResponse.json({ error: "Mode must be Off, Log only or Live." }, { status: 400 });
    }
    update["googleReviewConfig.automationMode"] = body.mode;
  }
  if (body.delayDaysAfterClosing !== undefined) {
    const d = body.delayDaysAfterClosing;
    if (typeof d !== "number" || !Number.isInteger(d) || d < 0 || d > MAX_REVIEW_DELAY_DAYS) {
      return NextResponse.json(
        { error: `Days after closing must be a whole number from 0 to ${MAX_REVIEW_DELAY_DAYS}.` },
        { status: 400 },
      );
    }
    update["googleReviewConfig.delayDaysAfterClosing"] = d;
  }
  if (Object.keys(update).length === 1) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }
  const ref = getAdminDb().doc(`subAccounts/${id}`);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  // update() with dotted paths needs the parent map to exist.
  if (!snap.data()?.googleReviewConfig) {
    await ref.set({ googleReviewConfig: {} }, { merge: true });
  }
  await ref.update(update);
  return NextResponse.json({ ok: true });
}
