import "server-only";

import { getAdminDb } from "@/lib/firebase/admin";
import type { QuoteKind } from "@/types/quotes";

/**
 * Quote / invoice number generator. Format:
 *   - quotes:   `Q-YYYY-NNNN`   (e.g. Q-2026-0001)
 *   - invoices: `INV-YYYY-NNNN` (e.g. INV-2026-0001)
 *
 * Sequence is per-sub-account AND per-kind — quotes and invoices each
 * have their own counter, so an operator can have Q-2026-0007 and
 * INV-2026-0003 active concurrently without overlap.
 *
 * Counter doc shapes, per sub-account:
 *
 *   subAccounts/{subAccountId}/counters/quoteNumbers
 *   subAccounts/{subAccountId}/counters/invoiceNumbers
 *     { year: 2026, seq: 7, updatedAt: ts }
 *
 * Concurrency: wrapped in a Firestore transaction so two operators
 * issuing simultaneously get distinct sequence values. When the year
 * ticks over, the next call notices `year` mismatch and resets `seq`
 * back to 0 before incrementing.
 */

const PADDING = 4;

interface KindMeta {
  counterDoc: string;
  prefix: string;
}

const KIND_META: Record<QuoteKind, KindMeta> = {
  quote: { counterDoc: "quoteNumbers", prefix: "Q" },
  invoice: { counterDoc: "invoiceNumbers", prefix: "INV" },
};

export async function issueQuoteNumber(
  subAccountId: string,
  kindOrDate?: QuoteKind | Date,
  maybeDate?: Date,
): Promise<string> {
  // Back-compat: existing callers passed `issueQuoteNumber(id)` or
  // `issueQuoteNumber(id, now)`. New callers pass kind explicitly.
  let kind: QuoteKind = "quote";
  let now: Date = new Date();
  if (kindOrDate instanceof Date) {
    now = kindOrDate;
  } else if (typeof kindOrDate === "string") {
    kind = kindOrDate;
    if (maybeDate) now = maybeDate;
  }

  if (!subAccountId) throw new Error("subAccountId required");
  const meta = KIND_META[kind];
  const year = now.getUTCFullYear();

  const db = getAdminDb();
  const counterRef = db
    .collection("subAccounts")
    .doc(subAccountId)
    .collection("counters")
    .doc(meta.counterDoc);

  const seq = await db.runTransaction(async (tx) => {
    const snap = await tx.get(counterRef);
    const data = snap.exists ? snap.data() : null;
    const sameYear = data && data.year === year;
    const nextSeq = (sameYear ? (data?.seq ?? 0) : 0) + 1;
    tx.set(
      counterRef,
      {
        year,
        seq: nextSeq,
        updatedAt: new Date(),
      },
      { merge: true },
    );
    return nextSeq;
  });

  return `${meta.prefix}-${year}-${String(seq).padStart(PADDING, "0")}`;
}
