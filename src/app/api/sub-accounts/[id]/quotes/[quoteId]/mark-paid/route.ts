import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";

import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { territoryGateForContact } from "@/lib/auth/territory-filter";
import {
  emitQuoteWebhook,
  fireQuoteTrigger,
  recordQuoteActivity,
} from "@/lib/quotes/lifecycle";
import { maybeSendReviewRequest } from "@/lib/reviews/request";
import type { Quote } from "@/types/quotes";

export const dynamic = "force-dynamic";

/**
 * POST /api/sub-accounts/[id]/quotes/[quoteId]/mark-paid
 *
 * v1 has no inline payment collection — once the recipient accepts the
 * quote and the operator collects payment off-system (bank transfer,
 * card swipe, manual invoice, etc.), they click "Mark as paid" to flip
 * the quote into its terminal "paid" state.
 *
 * Gates: caller must be a sub-account member. State transitions:
 *   - quote (kind="quote"):   accepted → paid
 *   - invoice (kind="invoice"): sent | viewed → paid
 * Returns 409 if the doc isn't ready to be marked paid (still draft,
 * declined, or already paid).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; quoteId: string }> },
): Promise<NextResponse> {
  const { id: subAccountId, quoteId } = await params;

  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const db = getAdminDb();
  const quoteRef = db.collection("quotes").doc(quoteId);
  const quoteSnap = await quoteRef.get();
  if (!quoteSnap.exists) {
    return NextResponse.json({ error: "Quote not found" }, { status: 404 });
  }
  const quote = quoteSnap.data() as Quote;
  if (quote.subAccountId !== subAccountId) {
    return NextResponse.json(
      { error: "Quote belongs to a different sub-account" },
      { status: 403 },
    );
  }
  const gate = await territoryGateForContact(access, quote.contactId);
  if (gate) return gate;
  if (quote.status === "paid") {
    return NextResponse.json(
      { error: "Already marked paid" },
      { status: 409 },
    );
  }
  const allowed =
    quote.kind === "invoice"
      ? quote.status === "sent" || quote.status === "viewed"
      : quote.status === "accepted";
  if (!allowed) {
    return NextResponse.json(
      {
        error:
          quote.kind === "invoice"
            ? `Only sent invoices can be marked paid. Current status: ${quote.status}`
            : `Only accepted quotes can be marked paid. Current status: ${quote.status}`,
      },
      { status: 409 },
    );
  }

  try {
    await quoteRef.update({
      status: "paid",
      paidAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  } catch (err) {
    console.error("[quotes/mark-paid] write failed", err);
    return NextResponse.json(
      { error: "Failed to update quote" },
      { status: 500 },
    );
  }

  // Side-effects — both swallow errors so a stale activity write
  // doesn't block the mark-paid success response.
  const quoteWithId = { ...quote, id: quoteId };
  await recordQuoteActivity(quoteWithId, "quote_marked_paid");
  await fireQuoteTrigger(quoteWithId, "quote_marked_paid");
  void emitQuoteWebhook(quoteWithId, "quote_marked_paid");

  // Auto Google review request ("after payment"). Fire-and-forget; gated by the
  // sub-account's review config (enabled + triggerOnQuotePaid) inside.
  void maybeSendReviewRequest({
    subAccountId,
    agencyId: quote.agencyId,
    contactId: quote.contactId,
    trigger: "quote_paid",
  });

  return NextResponse.json({ ok: true });
}
