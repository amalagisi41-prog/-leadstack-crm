import "server-only";

import { NextResponse } from "next/server";
import crypto from "node:crypto";
import type Stripe from "stripe";
import { getStripeServer } from "@/lib/stripe/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import {
  ADD_ON_KEYS,
  PLAN_KEYS,
  addOnPriceId,
  planPriceId,
  type AddOnKey,
  type PlanKey,
} from "@/lib/stripe/catalog";

/**
 * Public — no auth. Starts a brand-new-agency subscription checkout: the
 * base plan plus any selected real-gate add-ons (IDX, Social Planner, AI
 * Website Studio) as one Stripe Checkout Session with multiple line items,
 * one card charge, one subscription.
 *
 * Mints a random claim token (same pattern CLAUDE.md documents for the
 * post-payment GitHub-invite flow, applied here to "claim your workspace"
 * instead): the raw token rides in the success_url, only its SHA-256 hash
 * is ever persisted (by the webhook, once payment completes — see
 * lib/stripe/webhooks.ts). `/api/auth/claim-subscription` is the only
 * thing that can redeem it, and only once.
 *
 * An existing, already-signed-up agency owner adding an add-on to their
 * live subscription does NOT come through this route — see
 * `/api/sub-accounts/[id]/add-ons/purchase`, which extends the existing
 * Stripe subscription directly instead of starting a second one.
 */

interface Body {
  planKey?: string;
  addOnKeys?: string[];
  billingInterval?: "month" | "year";
}

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const planKey = body.planKey;
  if (!planKey || !PLAN_KEYS.includes(planKey as PlanKey)) {
    return NextResponse.json(
      { error: "A valid plan is required." },
      { status: 400 }
    );
  }
  const billingInterval = body.billingInterval === "year" ? "year" : "month";
  const priceId = planPriceId(planKey as PlanKey, billingInterval);
  if (planKey !== "starter" && !priceId) {
    return NextResponse.json(
      {
        error: `The "${planKey}" plan isn't configured on this deployment yet.`,
      },
      { status: 503 }
    );
  }

  const addOnKeys = Array.isArray(body.addOnKeys)
    ? body.addOnKeys.filter((k): k is AddOnKey =>
        ADD_ON_KEYS.includes(k as AddOnKey)
      )
    : [];
  const addOnPriceIds = addOnKeys
    .map((key) => addOnPriceId(key))
    .filter((id): id is string => !!id);

  const soloAmount = billingInterval === "year" ? 118_800 : 14_900;
  const planLineItem: Stripe.Checkout.SessionCreateParams.LineItem =
    planKey === "starter"
      ? {
          price_data: {
            currency: "usd",
            unit_amount: soloAmount,
            recurring: { interval: billingInterval },
            product_data: {
              name: "AgentStack Solo",
              description:
                billingInterval === "year"
                  ? "Single-user annual plan ($99/month, billed yearly)"
                  : "Single-user monthly plan",
            },
          },
          quantity: 1,
        }
      : { price: priceId!, quantity: 1 };
  const upfrontSoloLineItem: Stripe.Checkout.SessionCreateParams.LineItem | null =
    planKey === "starter"
      ? {
          price_data: {
            currency: "usd",
            unit_amount: soloAmount,
            product_data: {
              name: "AgentStack Solo — initial plan payment",
              description:
                billingInterval === "year"
                  ? "First annual payment today; includes one additional month before renewal"
                  : "First monthly payment today; includes one additional month before renewal",
            },
          },
          quantity: 1,
        }
      : null;
  const lineItems = [
    planLineItem,
    ...(upfrontSoloLineItem ? [upfrontSoloLineItem] : []),
    ...addOnPriceIds.map((id) => ({ price: id, quantity: 1 })),
  ];

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
  const claimToken = crypto.randomBytes(32).toString("hex");
  const authorization = request.headers.get("authorization") ?? "";
  const idToken = authorization.startsWith("Bearer ")
    ? authorization.slice(7)
    : "";
  const decoded = idToken
    ? await getAdminAuth().verifyIdToken(idToken).catch(() => null)
    : null;
  const authenticatedUid = decoded?.uid ?? null;
  let existingAgency:
    | { uid: string; agencyId: string; email: string }
    | null = null;
  if (authenticatedUid) {
    const record = await getAdminAuth()
      .getUser(authenticatedUid)
      .catch(() => null);
    const agencyId = record?.customClaims?.agencyId;
    const agencyRole = record?.customClaims?.agencyRole;
    if (
      record &&
      typeof agencyId === "string" &&
      agencyRole === "owner" &&
      (await getAdminDb().doc(`agencies/${agencyId}`).get()).exists
    ) {
      existingAgency = {
        uid: record.uid,
        agencyId,
        email: record.email ?? "",
      };
    }
  }
  const firstRenewal = new Date();
  firstRenewal.setUTCMonth(
    firstRenewal.getUTCMonth() + (billingInterval === "year" ? 13 : 2)
  );

  // The landing page's Add-ons section promises "stack 3+, save 15%" — only
  // literally true when this coupon is configured. Applied automatically,
  // never blocks checkout when unset (the banner's claim just doesn't
  // apply yet; nothing breaks).
  const bundleCouponId = process.env.STRIPE_ADDON_BUNDLE_COUPON_ID;
  const discounts =
    addOnPriceIds.length >= 3 && bundleCouponId
      ? [{ coupon: bundleCouponId }]
      : undefined;

  try {
    const stripe = getStripeServer();
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: lineItems,
      ...(existingAgency?.email
        ? { customer_email: existingAgency.email }
        : {}),
      ...(discounts ? { discounts } : {}),
      subscription_data: {
        // The separate one-time line above charges the first term now. The
        // recurring item begins after the paid term plus the bonus month:
        // two calendar months for monthly, thirteen for annual.
        trial_end:
          planKey === "starter"
            ? Math.floor(firstRenewal.getTime() / 1000)
            : undefined,
      },
      billing_address_collection: "required",
      custom_text: {
        submit: {
          message:
            billingInterval === "year"
              ? "Your card is charged $1,188 today and securely stored by Stripe. Your plan includes one bonus month; automatic annual renewal begins in 13 months unless you cancel. By subscribing, you agree to the AgentStack Terms at agentstackcrm.app/terms."
              : "Your card is charged $149 today and securely stored by Stripe. Your plan includes one bonus month; automatic monthly renewal begins in 2 months unless you cancel. By subscribing, you agree to the AgentStack Terms at agentstackcrm.app/terms.",
        },
      },
      success_url: existingAgency
        ? `${appUrl}/subscribe/success?session_id={CHECKOUT_SESSION_ID}`
        : `${appUrl}/welcome?session_id={CHECKOUT_SESSION_ID}&t=${claimToken}`,
      cancel_url: existingAgency
        ? `${appUrl}/subscribe?canceled=1`
        : `${appUrl}/#pricing`,
      metadata: {
        mode: existingAgency ? "existing_agency" : "new_agency",
        claimToken,
        planKey,
        billingInterval,
        ...(existingAgency
          ? {
              uid: existingAgency.uid,
              agencyId: existingAgency.agencyId,
            }
          : {}),
        addOnKeys: JSON.stringify(addOnKeys),
      },
    });

    if (!session.url) throw new Error("Stripe returned no checkout URL.");
    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("[checkout/subscribe] Stripe session creation failed", error);
    return NextResponse.json(
      {
        error:
          "Secure checkout is temporarily unavailable. Billing configuration needs attention.",
      },
      { status: 503 }
    );
  }
}
