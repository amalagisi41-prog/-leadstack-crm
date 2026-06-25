"use server";

import { requireAdminAction } from "@/lib/auth/require-admin";
import { getStripeServer } from "./server";

/**
 * Create a Stripe Billing Portal session for an existing customer.
 * Returns the portal URL to redirect the user to; returns null if the
 * customer doesn't have a Stripe record yet.
 */
export async function createBillingPortalSession(
  stripeCustomerId: string,
): Promise<string | null> {
  if (!stripeCustomerId) return null;
  await requireAdminAction();
  const stripe = getStripeServer();
  const session = await stripe.billingPortal.sessions.create({
    customer: stripeCustomerId,
    return_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings`,
  });
  return session.url;
}
