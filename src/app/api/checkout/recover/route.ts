import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import type Stripe from "stripe";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { getStripeServer } from "@/lib/stripe/server";
import { handleCheckoutCompleted } from "@/lib/stripe/webhooks";

/**
 * Reconciles a recently completed checkout with the signed-in workspace.
 * Stripe webhooks remain the primary source of truth; this authenticated
 * fallback prevents a delayed or missed webhook from asking a paid member
 * to purchase the same plan again.
 */
export async function POST(request: Request) {
  const uid = request.headers.get("x-user-uid");
  if (!uid) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const user = await getAdminAuth().getUser(uid).catch(() => null);
  const agencyId = user?.customClaims?.agencyId;
  const agencyRole = user?.customClaims?.agencyRole;
  if (!user || agencyRole !== "owner" || typeof agencyId !== "string") {
    return NextResponse.json({ error: "Workspace owner not found" }, { status: 403 });
  }

  const stripe = getStripeServer();
  const sessions = await stripe.checkout.sessions.list({ limit: 100 });
  const paidSessions = sessions.data.filter(
    (session) =>
      session.status === "complete" &&
      (session.payment_status === "paid" ||
        session.payment_status === "no_payment_required"),
  );
  const matchingExisting = paidSessions.find(
    (session) =>
      session.metadata?.mode === "existing_agency" &&
      session.metadata?.uid === uid &&
      session.metadata?.agencyId === agencyId,
  );
  const verifiedEmail = user.emailVerified ? user.email?.trim().toLowerCase() : null;
  const matchingNew = verifiedEmail
    ? paidSessions.find((session) => {
        const checkoutEmail =
          session.customer_details?.email?.trim().toLowerCase() ??
          session.customer_email?.trim().toLowerCase();
        return session.metadata?.mode === "new_agency" && checkoutEmail === verifiedEmail;
      })
    : undefined;
  const matching = matchingExisting ?? matchingNew;

  if (!matching || typeof matching.subscription !== "string") {
    return NextResponse.json({ recovered: false });
  }

  const subscription = await stripe.subscriptions.retrieve(
    matching.subscription,
  );
  if (subscription.status !== "active" && subscription.status !== "trialing") {
    return NextResponse.json({ recovered: false });
  }

  if (matching.metadata?.mode === "new_agency") {
    const purchaseRef = getAdminDb().doc(`purchases/${matching.id}`);
    const purchaseSnap = await purchaseRef.get();
    const purchase = purchaseSnap.data() as
      | { claimed?: boolean; claimedByUid?: string | null }
      | undefined;
    if (purchase?.claimed && purchase.claimedByUid !== uid) {
      return NextResponse.json({ recovered: false });
    }

    // Reuse the normal existing-workspace handler after replacing only the
    // routing metadata. The original Stripe session remains unchanged.
    const linkedSession = {
      ...matching,
      metadata: {
        ...(matching.metadata ?? {}),
        mode: "existing_agency",
        uid,
        agencyId,
      },
    } as Stripe.Checkout.Session;
    await handleCheckoutCompleted(linkedSession);
    await purchaseRef.set(
      {
        sessionId: matching.id,
        kind: "subscription",
        mode: "new_agency",
        email: verifiedEmail,
        stripeCustomerId:
          typeof matching.customer === "string" ? matching.customer : null,
        stripeSubscriptionId: matching.subscription,
        claimed: true,
        claimedAt: FieldValue.serverTimestamp(),
        claimedByUid: uid,
        recoveredIntoAgencyId: agencyId,
        recoveredAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  } else {
    await handleCheckoutCompleted(matching);
  }
  console.info(
    `[checkout/recover] Reconciled paid session ${matching.id} for agency ${agencyId}`,
  );
  return NextResponse.json({ recovered: true });
}
