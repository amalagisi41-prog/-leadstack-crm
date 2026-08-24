import type { User } from "firebase/auth";

/**
 * Sends the post-signup welcome email.
 *
 * This previously wrote directly to the `mail` Firestore collection with the
 * CLIENT SDK, for the Firebase Trigger-Email extension to pick up. It never
 * worked, for two independent reasons:
 *
 *   1. `firestore.rules` denies the `mail` collection outright
 *      (`allow read, write: if false`), so every write was permission-denied.
 *      Both call sites swallowed that into a `console.warn`.
 *   2. Nothing in setup installs the Trigger-Email extension, so a successful
 *      write would not have sent anything either.
 *
 * It now posts to `/api/auth/welcome-email`, which verifies the caller's ID
 * token, takes the recipient from that verified token (never from the request
 * body — otherwise it would be an open relay), and sends through Resend, the
 * same path every other email in the product uses.
 */
export async function sendWelcomeEmail(user: User): Promise<void> {
  const idToken = await user.getIdToken();

  const response = await fetch("/api/auth/welcome-email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken }),
  });

  if (!response.ok) {
    throw new Error(`Welcome email request failed: ${response.status}`);
  }
}
