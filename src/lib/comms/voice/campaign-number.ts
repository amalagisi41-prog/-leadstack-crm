import "server-only";

import { getAdminDb } from "@/lib/firebase/admin";

/**
 * Voice campaign code generator. Format `VC-YYYY-NNNN` (e.g. VC-2026-0001),
 * per-sub-account, resets each year. Mirrors lib/quotes/number.ts.
 *
 * Counter doc: subAccounts/{subAccountId}/counters/voiceCampaignNumbers
 *   { year: 2026, seq: 7, updatedAt: ts }
 *
 * Transaction-wrapped so two operators launching at once get distinct
 * codes.
 */

const PADDING = 4;

export async function issueVoiceCampaignCode(
  subAccountId: string,
  now: Date = new Date(),
): Promise<string> {
  if (!subAccountId) throw new Error("subAccountId required");
  const year = now.getUTCFullYear();

  const db = getAdminDb();
  const counterRef = db
    .collection("subAccounts")
    .doc(subAccountId)
    .collection("counters")
    .doc("voiceCampaignNumbers");

  const seq = await db.runTransaction(async (tx) => {
    const snap = await tx.get(counterRef);
    const data = snap.exists ? snap.data() : null;
    const sameYear = data && data.year === year;
    const nextSeq = (sameYear ? (data?.seq ?? 0) : 0) + 1;
    tx.set(counterRef, { year, seq: nextSeq, updatedAt: new Date() }, { merge: true });
    return nextSeq;
  });

  return `VC-${year}-${String(seq).padStart(PADDING, "0")}`;
}
