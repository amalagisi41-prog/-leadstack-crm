import "server-only";

import { FieldValue } from "firebase-admin/firestore";

import { getAdminDb } from "@/lib/firebase/admin";
import { emitContactCreatedById } from "@/lib/server/contacts-service";
import { GLOBAL_TERRITORY_ID } from "@/types";
import type { Contact } from "@/types/contacts";

/**
 * Reconcile a visitor identity (email / phone / name) to a Contact in
 * the sub-account. Email-first match — same strategy the web-chat
 * capture pipeline uses (`src/lib/comms/ai/capture.ts`). Booking
 * intake always collects an email so there's a stable reconciliation
 * key.
 *
 * Returns the contact id (existing or newly created) plus a flag
 * indicating whether the contact was created on this call. Caller uses
 * the flag to decide whether to fire `event_booked` activity at
 * "new lead" vs "repeat customer" intensity (v2 polish).
 *
 * Failure handling: throws on Firestore errors so the caller can return
 * a 500 to the visitor and bail before charging / sending email. Stale
 * states aren't acceptable here — booking POSTs are short, atomic
 * operations.
 */

interface ReconcileInput {
  agencyId: string;
  subAccountId: string;
  /** Lower-cased + trimmed at the call site. */
  email: string;
  /** Trimmed; may be empty. */
  name: string;
  /** Trimmed; may be empty. */
  phone: string;
  /**
   * Default territory the BookingPage assigns to new contacts. `null` =
   * fall back to the inbound-lead Global default. Existing contacts'
   * territory is NEVER touched here (operator owns the territory once
   * the contact exists).
   */
  defaultTerritoryId?: string | null;
}

export interface ReconciledContact {
  id: string;
  created: boolean;
}

export async function reconcileBookingContact(
  input: ReconcileInput,
): Promise<ReconciledContact> {
  const db = getAdminDb();
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();
  const phone = input.phone.trim();

  // Email-match within the sub-account. Cheap query: 0-1 results.
  const existing = await db
    .collection("contacts")
    .where("subAccountId", "==", input.subAccountId)
    .where("email", "==", email)
    .limit(1)
    .get();

  if (!existing.empty) {
    const doc = existing.docs[0];
    const data = doc.data() as Contact;
    // Best-effort update of missing fields (name + phone) — never
    // overwrites operator-curated data. Territory is left alone (see
    // function header).
    const patch: Record<string, unknown> = {};
    if (name && !data.name) patch.name = name;
    if (phone && !data.phone) patch.phone = phone;
    if (Object.keys(patch).length > 0) {
      patch.updatedAt = FieldValue.serverTimestamp();
      try {
        await doc.ref.update(patch);
      } catch {
        // Non-fatal — surface the booking even if the patch blips.
      }
    }
    return { id: doc.id, created: false };
  }

  // Create a new contact. `source: "booking-page"` so the new contact
  // badge distinguishes it from forms / web-chat captures.
  const territoryId =
    typeof input.defaultTerritoryId === "string" &&
    input.defaultTerritoryId.length > 0
      ? input.defaultTerritoryId
      : GLOBAL_TERRITORY_ID;
  const ref = await db.collection("contacts").add({
    name,
    email,
    phone,
    company: "",
    address: "",
    source: "booking-page",
    tags: [],
    pipelineStage: null,
    attribution: null,
    agencyId: input.agencyId,
    subAccountId: input.subAccountId,
    // The booking system creates the contact, not a logged-in user.
    // Same sentinel the form-submit + web-chat routes use.
    createdByUid: "booking-page",
    emailOptedOut: false,
    smsOptedOut: false,
    countryCode: null,
    country: null,
    city: null,
    lat: null,
    lng: null,
    territoryId,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  // A booking from a new visitor mints a real contact — fire contact.created
  // the same way every other create path does.
  void emitContactCreatedById({
    subAccountId: input.subAccountId,
    agencyId: input.agencyId,
    contactId: ref.id,
  });

  return { id: ref.id, created: true };
}
