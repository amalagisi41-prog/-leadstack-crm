import { doc, getDoc } from "firebase/firestore";
import { getFirebaseDb } from "@/lib/firebase/client";

/**
 * Resolve the territory a child record (deal / task / event) should
 * inherit from its linked contact. Returns the contact's `territoryId`
 * or `null` when there's no contact, the contact is missing, or it's
 * untagged.
 *
 * Territory is owned by the contact (the account); deals/quotes/tasks/
 * events copy it at creation and follow it on re-tag. Centralised here
 * so every client creation path inherits identically.
 */
export async function territoryIdForContact(
  contactId: string | null | undefined,
): Promise<string | null> {
  if (!contactId) return null;
  try {
    const snap = await getDoc(doc(getFirebaseDb(), "contacts", contactId));
    return (snap.data()?.territoryId as string | null | undefined) ?? null;
  } catch {
    return null;
  }
}
