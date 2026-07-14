import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";

/**
 * Stamps `contacts/{id}.lastContactedAt` after an outbound email/SMS/
 * WhatsApp send. Powers the Smart Workflows `contact.stale` time-based
 * trigger (see `lib/workflows/time-triggers.ts`) without scanning every
 * message subcollection — same idiom as the existing `lastOutboundCallAt` /
 * `reviewRequestedAt` denormalised stamps.
 *
 * Best-effort: a failure here must never break the send it's attached to,
 * so errors are swallowed and logged rather than thrown.
 */
export async function markContactContacted(contactId: string): Promise<void> {
  try {
    await getAdminDb()
      .doc(`contacts/${contactId}`)
      .set({ lastContactedAt: FieldValue.serverTimestamp() }, { merge: true });
  } catch (err) {
    console.warn("[mark-contacted] failed to stamp lastContactedAt", contactId, err);
  }
}
