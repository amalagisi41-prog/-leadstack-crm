import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAgencyOwner } from "@/lib/auth/require-tenancy";
import type { AgencyDoc, SubAccountDoc } from "@/types";
import {
  ADD_ON_GATE_FIELD,
  ADD_ON_KEYS,
  addOnPriceId,
  type AddOnKey,
} from "@/lib/stripe/catalog";
import { getStripeServer } from "@/lib/stripe/server";
import {
  findAddOnItem,
  retrieveAgencySubscription,
  syncBundleDiscount,
} from "@/lib/stripe/subscription-management";

interface Body {
  addOnKey?: string;
  enabled?: boolean;
}

export async function PATCH(
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

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const addOnKey = body.addOnKey;
  if (!addOnKey || !ADD_ON_KEYS.includes(addOnKey as AddOnKey)) {
    return NextResponse.json(
      { error: "A valid addOnKey is required." },
      { status: 400 },
    );
  }
  if (typeof body.enabled !== "boolean") {
    return NextResponse.json(
      { error: "`enabled` must be true or false." },
      { status: 400 },
    );
  }

  const gateField = ADD_ON_GATE_FIELD[addOnKey as AddOnKey];
  const currentlyEnabled =
    (sub as unknown as Record<string, unknown>)[gateField] === true;
  if (currentlyEnabled === body.enabled) {
    return NextResponse.json(
      {
        ok: true,
        enabled: body.enabled,
        gateField,
        summary: null,
      },
      { status: 200 },
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
      { error: "No active subscription found for your agency." },
      { status: 400 },
    );
  }

  const stripe = getStripeServer();

  if (body.enabled) {
    await stripe.subscriptionItems.create({
      subscription: agency.subscriptionId,
      price: priceId,
      quantity: 1,
      metadata: {
        addOnKey,
        subAccountId,
      },
    });
  } else {
    const subscription = await retrieveAgencySubscription(agency);
    const item = subscription
      ? findAddOnItem(subscription, addOnKey as AddOnKey, subAccountId)
      : null;
    if (item) {
      await stripe.subscriptionItems.del(item.id);
    }
  }

  await db.doc(`subAccounts/${subAccountId}`).update({
    [gateField]: body.enabled,
    updatedAt: FieldValue.serverTimestamp(),
  });

  const summary = await syncBundleDiscount(agency.subscriptionId);
  return NextResponse.json({
    ok: true,
    enabled: body.enabled,
    gateField,
    summary,
  });
}
