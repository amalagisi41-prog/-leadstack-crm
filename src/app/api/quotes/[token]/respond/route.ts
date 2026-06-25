import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";

import { getAdminDb } from "@/lib/firebase/admin";
import { hashQuoteToken, verifyQuoteToken } from "@/lib/quotes/token";
import { isQuoteExpired } from "@/lib/quotes/calc";
import {
  autoCreateDealForAcceptedQuote,
  emitQuoteWebhook,
  fireQuoteTrigger,
  recordQuoteActivity,
} from "@/lib/quotes/lifecycle";
import {
  DECLINE_REASONS,
  type DeclineReason,
  type QuoteRespondPayload,
} from "@/types/quotes";
import type { Quote } from "@/types/quotes";

export const dynamic = "force-dynamic";

/**
 * POST /api/quotes/[token]/respond
 *
 * Recipient-facing endpoint hit by the Accept/Decline buttons on the
 * public quote page. No auth — the token IS the credential. Defense:
 *   - HMAC verification (rejects unsigned / forged tokens)
 *   - publicTokenHash comparison (rejects leaked old tokens after a
 *     re-send rotated them)
 *   - status gate (refuse to flip a quote that's already terminal)
 *   - expiry check (can't accept past validUntil)
 *
 * Day-4 work will extend this with workflow trigger firing +
 * auto-create-deal on accept + activity timeline entries. For now, the
 * status transitions are atomic via a Firestore transaction.
 */

interface SuccessBody {
  ok: true;
  status: "accepted" | "declined";
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  const { token } = await params;

  const verified = verifyQuoteToken(token);
  if (!verified) {
    return NextResponse.json(
      { error: "Invalid or expired link" },
      { status: 404 },
    );
  }

  let payload: QuoteRespondPayload;
  try {
    payload = (await request.json()) as QuoteRespondPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (payload.action !== "accept" && payload.action !== "decline") {
    return NextResponse.json(
      { error: "action must be 'accept' or 'decline'" },
      { status: 400 },
    );
  }

  let reason: DeclineReason | null = null;
  let note: string | null = null;
  if (payload.action === "decline") {
    const r = payload.reason;
    if (!r || !DECLINE_REASONS.includes(r as DeclineReason)) {
      return NextResponse.json(
        {
          error: `decline.reason must be one of: ${DECLINE_REASONS.join(", ")}`,
        },
        { status: 400 },
      );
    }
    reason = r as DeclineReason;
    const trimmedNote =
      typeof payload.note === "string" ? payload.note.trim() : "";
    if (reason === "Other" && !trimmedNote) {
      return NextResponse.json(
        { error: "A note is required when reason is 'Other'" },
        { status: 400 },
      );
    }
    note = trimmedNote ? trimmedNote.slice(0, 2000) : null;
  }

  const db = getAdminDb();
  const quoteRef = db.collection("quotes").doc(verified.quoteId);
  const presentedHash = hashQuoteToken(token);

  // Transactional state flip. Re-reads inside the txn so two concurrent
  // accepts (e.g. recipient triple-clicks on a slow connection) don't
  // produce inconsistent state.
  try {
    const result = await db.runTransaction(async (tx) => {
      const snap = await tx.get(quoteRef);
      if (!snap.exists) {
        return { error: "Quote not found", status: 404 } as const;
      }
      const quote = snap.data() as Quote;
      if (quote.publicTokenHash !== presentedHash) {
        return { error: "Invalid or expired link", status: 404 } as const;
      }
      if (
        quote.status === "accepted" ||
        quote.status === "declined" ||
        quote.status === "paid"
      ) {
        return {
          error: `Quote was already ${quote.status} — refresh the page to see the latest.`,
          status: 409,
        } as const;
      }
      if (payload.action === "accept" && isQuoteExpired(quote)) {
        return {
          error: "This quote has expired and can no longer be accepted.",
          status: 409,
        } as const;
      }

      if (payload.action === "accept") {
        tx.update(quoteRef, {
          status: "accepted",
          acceptedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      } else {
        tx.update(quoteRef, {
          status: "declined",
          declinedAt: FieldValue.serverTimestamp(),
          declineReason: reason,
          declineNote: note,
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
      return { ok: true } as const;
    });

    if ("error" in result) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status },
      );
    }
  } catch (err) {
    console.error("[/api/quotes/respond] txn failed", err);
    return NextResponse.json(
      { error: "Failed to record response" },
      { status: 500 },
    );
  }

  // Side-effects: re-load the quote once the txn has committed so the
  // lifecycle helpers see the post-transition state. All helpers
  // swallow errors internally — they're nice-to-have follow-ups, not
  // gates on the recipient's response succeeding.
  const freshSnap = await quoteRef.get();
  if (freshSnap.exists) {
    const freshQuote = {
      id: freshSnap.id,
      ...(freshSnap.data() as Omit<Quote, "id">),
    };
    if (payload.action === "accept") {
      await recordQuoteActivity(freshQuote, "quote_accepted");
      await fireQuoteTrigger(freshQuote, "quote_accepted");
      void emitQuoteWebhook(freshQuote, "quote_accepted");
      // Auto-create the Won-stage deal when the operator opted in.
      // Helper no-ops when the flag is false.
      await autoCreateDealForAcceptedQuote(freshQuote);
    } else {
      const noteSuffix = note ? `: "${note}"` : "";
      await recordQuoteActivity(freshQuote, "quote_declined", {
        extra: `reason: ${reason}${noteSuffix}`,
      });
      await fireQuoteTrigger(freshQuote, "quote_declined");
      void emitQuoteWebhook(freshQuote, "quote_declined");
    }
  }

  const body: SuccessBody = {
    ok: true,
    status: payload.action === "accept" ? "accepted" : "declined",
  };
  return NextResponse.json(body);
}
