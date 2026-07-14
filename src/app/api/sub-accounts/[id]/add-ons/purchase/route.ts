import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { getStripeServer } from "@/lib/stripe/server";
import { requireAgencyOwner } from "@/lib/auth/require-tenancy";
import {
  ADD_ON_GATE_FIELD,
  ADD_ON_KEYS,
  addOnPriceId,
  type AddOnKey,
} from "@/lib/stripe/catalog";
import type { AgencyDoc, SubAccountDoc } from "@/types";

/**
 * Existing, already-signed-up agency owner adds one real-gate add-on (IDX,
 * Social Planner, AI Website Studio) to this sub-account. Deliberately NOT
 * a Checkout Session — starting a second Checkout Session for an existing
 * Stripe customer creates a SEPARATE, parallel subscription rather than
 * extending the live one. The correct Stripe primitive for "add a line item
 * to my active subscription" is the Subscription Items API, called
 * directly here; the gate flips immediately on success (no webhook
 * round-trip needed for this path — `customer.subscription.updated` will
 * also fire and no-ops harmlessly).
 */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: subAccountId } = await ctx.params;
  const db = getAdminDb();

  const subSnap = await db.doc(`subAccounts/${subAccountId}`).get();
  if (!subSnap.exists) {
    return NextResponse.json({ error: "Sub-account not found" }, { status: 404 });
  }
  const sub = subSnap.data() as SubAccountDoc;

  const access = await requireAgencyOwner(request, sub.agencyId);
  if (access instanceof NextResponse) return access;

  let body: { addOnKey?: string };
  try {
    body = (await request.json()) as { addOnKey?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const addOnKey = body.addOnKey;
  if (!addOnKey || !ADD_ON_KEYS.includes(addOnKey as AddOnKey)) {
    return NextResponse.json(
      { error: "A valid addOnKey is required." },
      { status: 400 },
    );
  }
  const gateField = ADD_ON_GATE_FIELD[addOnKey as AddOnKey];
  if ((sub as unknown as Record<string, unknown>)[gateField] === true) {
    return NextResponse.json(
      { error: "This add-on is already active for this sub-account." },
      { status: 409 },
    );
  }

  const priceId = addOnPriceId(addOnKey as AddOnKey);
  if (!priceId) {
    return NextResponse.json(
      { error: "This add-on isn't configured on this deployment yet." },
      { status: 503 },
    );
  }

  const agencySnap = await db.doc(`agencies/${sub.agencyId}`).get();
  const agency = agencySnap.data() as AgencyDoc | undefined;
  if (!agency?.subscriptionId) {
    return NextResponse.json(
      {
        error:
          "No active subscription found for your agency. Subscribe to a plan first.",
      },
      { status: 400 },
    );
  }

  const stripe = getStripeServer();
  try {
    await stripe.subscriptionItems.create({
      subscription: agency.subscriptionId,
      price: priceId,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not add this add-on.";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  await db.doc(`subAccounts/${subAccountId}`).update({
    [gateField]: true,
    updatedAt: FieldValue.serverTimestamp(),
  });

  return NextResponse.json({ ok: true, gateField });
}
