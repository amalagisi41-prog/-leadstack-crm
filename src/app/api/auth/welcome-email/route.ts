import "server-only";

import { NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/firebase/admin";
import { sendEmail, emailIsConfigured } from "@/lib/comms/resend";
import { CUSTOM_BRAND } from "@/config/landing";

/**
 * POST /api/auth/welcome-email
 *
 * Sends the post-signup welcome email.
 *
 * WHY THIS ROUTE EXISTS
 * ---------------------
 * This used to be a CLIENT-side `addDoc(collection(db, "mail"), …)` in
 * lib/firestore/mail.ts, targeting the Firebase Trigger-Email extension.
 * Two things were wrong with that, and together they meant no customer had
 * ever received a welcome email:
 *
 *   1. `firestore.rules` denies all access to the `mail` collection
 *      (`allow read, write: if false`), so every write was
 *      permission-denied. Both call sites wrapped it in
 *      `.catch(err => console.warn(...))`, so the failure was invisible.
 *   2. Nothing in the setup process installs the Trigger-Email extension,
 *      so even a successful write would not have sent anything.
 *
 * Sending through Resend instead reuses the email path the rest of the
 * product already depends on and already documents.
 *
 * ABUSE
 * -----
 * The recipient is taken from the VERIFIED ID token, never from the request
 * body. Without that this would be an open relay: anyone could POST an
 * arbitrary address and have our verified domain send mail to it.
 */
export async function POST(request: Request) {
  if (!emailIsConfigured()) {
    // Not an error worth surfacing to a user mid-signup — they are already
    // through the door. Say so for the logs and move on.
    return NextResponse.json(
      { ok: false, skipped: "email_not_configured" },
      { status: 200 },
    );
  }

  let idToken: string | undefined;
  try {
    const body = (await request.json()) as { idToken?: string };
    idToken = body.idToken;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!idToken) {
    return NextResponse.json({ error: "idToken is required" }, { status: 401 });
  }

  const decoded = await getAdminAuth()
    .verifyIdToken(idToken)
    .catch(() => null);

  if (!decoded?.email) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const to = decoded.email;
  const displayName =
    (typeof decoded.name === "string" && decoded.name.trim()) ||
    to.split("@")[0];

  const brand = CUSTOM_BRAND.name;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "") ?? "";

  try {
    await sendEmail({
      to,
      subject: `Welcome to ${brand}, ${displayName}`,
      text: [
        `Welcome, ${displayName}.`,
        "",
        `Your ${brand} workspace is ready.`,
        appUrl ? `Get started: ${appUrl}/dashboard` : "",
        "",
        "If you have any questions, just reply to this email.",
      ]
        .filter(Boolean)
        .join("\n"),
      html: `
        <p>Welcome, ${escapeHtml(displayName)}.</p>
        <p>Your ${escapeHtml(brand)} workspace is ready.</p>
        ${
          appUrl
            ? `<p><a href="${appUrl}/dashboard">Open your dashboard</a></p>`
            : ""
        }
        <p>If you have any questions, just reply to this email.</p>
      `,
    });
  } catch (error) {
    // A failed welcome email must never break signup — the customer is
    // already in. Log it properly rather than swallowing it into a
    // console.warn nobody reads.
    console.error("[auth/welcome-email] send failed", error);
    return NextResponse.json(
      { ok: false, error: "send_failed" },
      { status: 200 },
    );
  }

  return NextResponse.json({ ok: true });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
