import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";

import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { territoryGateForContact } from "@/lib/auth/territory-filter";
import { emailIsConfigured, sendEmail, tenantFrom } from "@/lib/comms/resend";
import { renderQuoteEmail } from "@/lib/quotes/email";
import {
  emitQuoteWebhook,
  fireQuoteTrigger,
  recordQuoteActivity,
} from "@/lib/quotes/lifecycle";
import { buildQuoteUrl, issueQuoteToken } from "@/lib/quotes/token";
import { buildPaypalInvoiceUrl } from "@/lib/paypal/payment-link";
import type { Quote } from "@/types/quotes";
import type { SubAccountDoc } from "@/types";

export const dynamic = "force-dynamic";

/**
 * POST /api/sub-accounts/[id]/quotes/[quoteId]/send
 *
 * Send (or re-send) a quote or invoice to its recipient.
 *
 *   1. Verify caller is an active member of the sub-account.
 *   2. Load the quote + verify it belongs to this sub-account.
 *   3. Load the recipient contact + verify email present.
 *   4. Load the sub-account doc for business name + PayPal config.
 *   4a. Invoice path: generate a paypal.me URL from the sub-account's
 *       PayPal username + invoice total. Always regenerated on send
 *       (paypal.me URLs are stateless, no API call, no "old link" to
 *       deactivate). 503 if PayPal isn't configured.
 *   5. Issue a fresh public token (HMAC-signed) and persist the hash.
 *   6. Render + send the email via Resend. Reply-To = caller's email.
 *   7. Persist lifecycle update.
 *   8. Fire activity + automation side-effects.
 *
 * 503 when Resend isn't configured (quote or invoice) OR when PayPal
 * isn't configured (invoice only).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; quoteId: string }> },
): Promise<NextResponse> {
  const { id: subAccountId, quoteId } = await params;

  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  if (!emailIsConfigured()) {
    return NextResponse.json(
      {
        error:
          "Email isn't configured on this deployment — set RESEND_API_KEY + EMAIL_FROM to send quotes.",
      },
      { status: 503 },
    );
  }

  const db = getAdminDb();

  // 2. Load quote + tenancy gate
  const quoteRef = db.collection("quotes").doc(quoteId);
  const quoteSnap = await quoteRef.get();
  if (!quoteSnap.exists) {
    return NextResponse.json({ error: "Quote not found" }, { status: 404 });
  }
  const quote = { id: quoteSnap.id, ...(quoteSnap.data() as Omit<Quote, "id">) };
  if (quote.subAccountId !== subAccountId) {
    return NextResponse.json(
      { error: "Quote belongs to a different sub-account" },
      { status: 403 },
    );
  }
  // Territory scoping — a scoped collaborator can only act on quotes
  // whose contact is in their assigned territories.
  const gate = await territoryGateForContact(access, quote.contactId);
  if (gate) return gate;

  // 3. Load contact + email check
  const contactSnap = await db.doc(`contacts/${quote.contactId}`).get();
  if (!contactSnap.exists) {
    return NextResponse.json(
      { error: "Recipient contact no longer exists" },
      { status: 404 },
    );
  }
  const contact = contactSnap.data() as { email?: string; name?: string };
  const recipientEmail = contact.email?.trim();
  if (!recipientEmail) {
    return NextResponse.json(
      {
        error:
          "Contact has no email address — add one to their profile, then re-send.",
      },
      { status: 400 },
    );
  }

  // 4. Sub-account doc for business name + PayPal config + logo
  const subSnap = await db.doc(`subAccounts/${subAccountId}`).get();
  const sub = (subSnap.exists ? (subSnap.data() as SubAccountDoc) : null);
  const businessName = sub?.name || "Your business";
  const businessLogoUrl = sub?.logoUrl ?? null;

  // 4a. Invoice path — build a paypal.me URL from the sub-account's
  //     PayPal config. Always regenerate on send (paypal.me URLs encode
  //     the amount inline; no API call; no old link to deactivate).
  let paymentLinkUpdate: {
    paymentLinkUrl: string;
    paymentLinkId: string | null;
    paymentLinkMintedAt: ReturnType<typeof FieldValue.serverTimestamp>;
  } | null = null;
  if (quote.kind === "invoice") {
    const paypal = sub?.paypalConfig ?? null;
    if (!paypal?.username) {
      return NextResponse.json(
        {
          error:
            "Connect PayPal under Settings → Payments before sending invoices.",
        },
        { status: 503 },
      );
    }
    try {
      const url = buildPaypalInvoiceUrl({ paypal, invoice: quote });
      paymentLinkUpdate = {
        paymentLinkUrl: url,
        paymentLinkId: null,
        paymentLinkMintedAt: FieldValue.serverTimestamp(),
      };
      // Reflect locally so the email + activity see the fresh URL.
      quote.paymentLinkUrl = url;
      quote.paymentLinkId = null;
    } catch (err) {
      console.error("[quotes/send] paypal link build failed", err);
      return NextResponse.json(
        {
          error: `Failed to build PayPal link: ${
            err instanceof Error ? err.message : "unknown error"
          }`,
        },
        { status: 500 },
      );
    }
  }

  // 5. Issue token (server-only, HMAC + nonce; raw token never persisted)
  let token: string;
  let hash: string;
  try {
    ({ token, hash } = issueQuoteToken(quoteId));
  } catch (err) {
    console.error("[quotes/send] issueQuoteToken failed", err);
    return NextResponse.json(
      {
        error:
          "Failed to mint quote token. Check AUTOMATIONS_TOKEN_SECRET is configured.",
      },
      { status: 500 },
    );
  }
  const publicUrl = buildQuoteUrl(token);
  if (!publicUrl) {
    return NextResponse.json(
      {
        error:
          "NEXT_PUBLIC_APP_URL isn't configured — set it so quote links resolve.",
      },
      { status: 503 },
    );
  }

  // 6. Render + send the email. Reply-To = caller so visitor replies
  //    land in the operator's inbox. From = the sub-account's dedicated
  //    sending domain when verified; falls back to the shared EMAIL_FROM.
  const email = renderQuoteEmail({
    quote,
    businessName,
    businessLogoUrl,
    recipientName: contact.name?.trim() || "",
    publicUrl,
  });
  try {
    await sendEmail({
      to: recipientEmail,
      subject: email.subject,
      text: email.text,
      html: email.html,
      replyTo: access.email || undefined,
      from: tenantFrom(sub),
    });
  } catch (err) {
    console.error("[quotes/send] Resend send failed", err);
    const message =
      err instanceof Error ? err.message : "Email provider rejected the send";
    return NextResponse.json(
      { error: `Send failed: ${message}` },
      { status: 502 },
    );
  }

  // 7. Persist lifecycle update. Use viewedAt = null to RESET on re-send
  //    (each new token starts a fresh "have they opened it yet?" cycle).
  const wasResend = quote.status !== "draft";
  try {
    await quoteRef.update({
      status: "sent",
      sentAt: FieldValue.serverTimestamp(),
      viewedAt: null,
      publicTokenHash: hash,
      updatedAt: FieldValue.serverTimestamp(),
      ...(paymentLinkUpdate ?? {}),
    });
  } catch (err) {
    console.error("[quotes/send] quote lifecycle write failed", err);
  }

  // 8. Side-effects: contact activity row + automation trigger.
  await recordQuoteActivity(quote, "quote_sent", {
    extra: wasResend ? "re-sent" : null,
  });
  await fireQuoteTrigger(quote, "quote_sent");
  void emitQuoteWebhook(quote, "quote_sent");

  return NextResponse.json({
    ok: true,
    sentTo: recipientEmail,
    paymentLinkUrl: paymentLinkUpdate?.paymentLinkUrl ?? quote.paymentLinkUrl ?? null,
  });
}
