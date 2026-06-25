"use server";

import { requireAdminAction } from "@/lib/auth/require-admin";
import { getStripeServer } from "./server";

export async function createCheckoutSession(priceId: string, _uid: string) {
  // Workspace billing is keyed to the verified admin uid from the session cookie.
  // The client-supplied uid is ignored; it stays in the signature for callers that
  // already pass it.
  void _uid;
  const auth = await requireAdminAction();

  const stripe = getStripeServer();
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    payment_method_types: ["card"],
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/pricing`,
    metadata: { uid: auth.uid },
  });

  return session.url;
}
