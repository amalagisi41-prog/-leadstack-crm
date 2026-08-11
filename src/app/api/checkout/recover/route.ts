import "server-only";

import { NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/firebase/admin";
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
  const matching = sessions.data.find(
    (session) =>
      session.status === "complete" &&
      (session.payment_status === "paid" ||
        session.payment_status === "no_payment_required") &&
      session.metadata?.mode === "existing_agency" &&
      session.metadata?.uid === uid &&
      session.metadata?.agencyId === agencyId,
  );

  if (!matching || typeof matching.subscription !== "string") {
    return NextResponse.json({ recovered: false });
  }

  const subscription = await stripe.subscriptions.retrieve(
    matching.subscription,
  );
  if (subscription.status !== "active" && subscription.status !== "trialing") {
    return NextResponse.json({ recovered: false });
  }

  await handleCheckoutCompleted(matching);
  console.info(
    `[checkout/recover] Reconciled paid session ${matching.id} for agency ${agencyId}`,
  );
  return NextResponse.json({ recovered: true });
}
