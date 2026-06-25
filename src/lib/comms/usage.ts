import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";

export type SendKind = "email" | "sms";

function monthKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Increment the owner's send counters. Best-effort — failures are logged
 * and swallowed so a counter outage never blocks a user's send.
 */
export async function recordSend(uid: string, kind: SendKind): Promise<void> {
  try {
    const db = getAdminDb();
    const ref = db.collection("usage").doc(uid);
    const month = monthKey();
    await ref.set(
      {
        [kind]: FieldValue.increment(1),
        [`${kind}ByMonth`]: { [month]: FieldValue.increment(1) },
        lastSendAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  } catch (err) {
    console.warn("[usage] recordSend failed", { uid, kind, err });
  }
}
