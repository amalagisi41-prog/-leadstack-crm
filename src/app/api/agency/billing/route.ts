import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import {
  PURCHASABLE_PLAN_KEYS,
  isPurchasablePlanKey,
  isSelfServePlanKey,
  type SelfServePlanKey,
} from "@/config/landing";
import type { AgencyRole, AgencyDoc, MemberStatus } from "@/types";
import { getStripeServer } from "@/lib/stripe/server";
import { planPriceId } from "@/lib/stripe/catalog";
import {
  findBasePlanItem,
  retrieveAgencySubscription,
  summarizeAgencyBilling,
  summarizeSubscription,
  type BillingSnapshot,
} from "@/lib/stripe/subscription-management";
import {
  billUnbilledAddOns,
  findUnbilledAddOns,
} from "@/lib/stripe/add-on-reconcile";

type BillingAction =
  | {
      action: "switch_plan";
      planKey?: string;
    }
  | {
      action: "cancel";
      reason?: string;
      detail?: string;
    }
  | {
      action: "resume";
    }
  | {
      action: "portal";
    }
  | {
      action: "bill_add_ons";
    };

interface CallerClaims {
  agencyId?: string | null;
  agencyRole?: AgencyRole | null;
  status?: MemberStatus;
}

function feedbackForReason(
  reason: string,
):
  | "customer_service"
  | "low_quality"
  | "missing_features"
  | "other"
  | "switched_service"
  | "too_complex"
  | "too_expensive"
  | "unused" {
  switch (reason) {
    case "too_expensive":
      return "too_expensive";
    case "missing_features":
      return "missing_features";
    case "too_complex":
      return "too_complex";
    case "switched_service":
      return "switched_service";
    case "unused":
      return "unused";
    case "support":
      return "customer_service";
    default:
      return "other";
  }
}

async function readOwner(
  request: Request,
): Promise<
  | {
      agencyId: string;
      uid: string;
      email: string;
      agency: AgencyDoc;
    }
  | NextResponse
> {
  const uid = request.headers.get("x-user-uid");
  if (!uid) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const record = await getAdminAuth().getUser(uid).catch(() => null);
  if (!record) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const claims = (record.customClaims ?? {}) as CallerClaims;
  if (claims.status !== "active") {
    return NextResponse.json({ error: "Account inactive" }, { status: 403 });
  }
  if (claims.agencyRole !== "owner" || !claims.agencyId) {
    return NextResponse.json(
      { error: "Agency owner only" },
      { status: 403 },
    );
  }
  const agencySnap = await getAdminDb().doc(`agencies/${claims.agencyId}`).get();
  if (!agencySnap.exists) {
    return NextResponse.json({ error: "Agency not found" }, { status: 404 });
  }
  return {
    agencyId: claims.agencyId,
    uid,
    email: record.email ?? "",
    agency: agencySnap.data() as AgencyDoc,
  };
}

/**
 * Plans this account may switch to right now: listed as purchasable AND
 * backed by a configured Stripe price. The billing UI offers a switch only
 * for these, so an on-hold plan (Team today) never shows "Switch to …".
 */
function switchablePlanKeys(): SelfServePlanKey[] {
  return PURCHASABLE_PLAN_KEYS.filter((key) => !!planPriceId(key));
}

function responseForSummary(summary: BillingSnapshot) {
  return {
    ok: true,
    summary,
    switchablePlanKeys: switchablePlanKeys(),
  };
}

export async function GET(request: Request) {
  const owner = await readOwner(request);
  if (owner instanceof NextResponse) return owner;

  let subscription = await retrieveAgencySubscription(owner.agency);
  // Self-heal: an add-on that is switched on but missing from the
  // subscription is attached here, with no proration (it bills from the next
  // cycle; nothing already unbilled is charged). The owner no longer has to
  // find and press a button for features they are already using.
  if (subscription) {
    try {
      const { attached } = await billUnbilledAddOns(owner.agency, owner.agencyId, subscription);
      if (attached.length > 0) subscription = await retrieveAgencySubscription(owner.agency);
    } catch (error) {
      console.error("[billing] Could not attach active add-ons", error);
    }
  }
  // The invoice preview (Stripe) and the unbilled-add-on scan (Firestore)
  // are independent — run them together instead of back to back.
  const [summary, unbilledAddOns] = await Promise.all([
    summarizeAgencyBilling(subscription),
    findUnbilledAddOns(owner.agencyId, subscription),
  ]);
  return NextResponse.json({ ...responseForSummary(summary), unbilledAddOns });
}

export async function POST(request: Request) {
  const owner = await readOwner(request);
  if (owner instanceof NextResponse) return owner;

  let body: BillingAction;
  try {
    body = (await request.json()) as BillingAction;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const stripe = getStripeServer();
  const db = getAdminDb();
  const subscription = await retrieveAgencySubscription(owner.agency);

  if (!subscription || !owner.agency.subscriptionId) {
    return NextResponse.json(
      { error: "No active subscription found for this agency." },
      { status: 400 },
    );
  }

  if (body.action === "bill_add_ons") {
    const { attached, unresolved } = await billUnbilledAddOns(
      owner.agency,
      owner.agencyId,
      subscription,
    );
    const refreshed = await retrieveAgencySubscription(owner.agency);
    const [summary, unbilledAddOns] = await Promise.all([
      summarizeAgencyBilling(refreshed),
      findUnbilledAddOns(owner.agencyId, refreshed),
    ]);
    return NextResponse.json({ ...responseForSummary(summary), unbilledAddOns, attached, unresolved });
  }

  if (body.action === "portal") {
    const customerId = owner.agency.stripeCustomerId;
    if (!customerId) {
      return NextResponse.json(
        { error: "No Stripe customer is connected yet." },
        { status: 400 },
      );
    }
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${appUrl}/agency/billing`,
    });
    return NextResponse.json({ ok: true, url: session.url });
  }

  if (body.action === "switch_plan") {
    if (!isSelfServePlanKey(body.planKey)) {
      return NextResponse.json(
        { error: "A valid self-serve plan is required." },
        { status: 400 },
      );
    }
    if (!isPurchasablePlanKey(body.planKey)) {
      return NextResponse.json(
        { error: "That plan isn't available right now." },
        { status: 400 },
      );
    }
    const nextPriceId = planPriceId(body.planKey);
    if (!nextPriceId) {
      console.error(`[billing-config] No Stripe price configured for plan "${body.planKey}".`);
      return NextResponse.json(
        { error: "That plan isn't available to switch to right now. Please contact support." },
        { status: 503 },
      );
    }
    const basePlan = findBasePlanItem(subscription);
    if (!basePlan) {
      return NextResponse.json(
        {
          error:
            "Your current subscription isn't on a self-serve plan, so it can't be switched automatically yet.",
        },
        { status: 409 },
      );
    }
    if (basePlan.planKey === body.planKey) {
      return NextResponse.json(
        responseForSummary(await summarizeAgencyBilling(subscription)),
      );
    }

    const updated = await stripe.subscriptions.update(owner.agency.subscriptionId, {
      items: [{ id: basePlan.item.id, price: nextPriceId }],
      proration_behavior: "create_prorations",
      expand: ["discounts", "items.data.price"],
    });

    await db.doc(`agencies/${owner.agencyId}`).update({
      subscriptionPriceId: nextPriceId,
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json(
      responseForSummary(await summarizeAgencyBilling(updated)),
    );
  }

  if (body.action === "resume") {
    const updated = await stripe.subscriptions.update(owner.agency.subscriptionId, {
      cancel_at_period_end: false,
      expand: ["discounts", "items.data.price"],
    });

    await db
      .collection(`agencies/${owner.agencyId}/billingFeedback`)
      .add({
        action: "resume",
        createdAt: FieldValue.serverTimestamp(),
        createdByUid: owner.uid,
        createdByEmail: owner.email,
      });

    return NextResponse.json(
      responseForSummary(await summarizeAgencyBilling(updated)),
    );
  }

  if (body.action === "cancel") {
    const normalizedReason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (!normalizedReason) {
      return NextResponse.json(
        { error: "A cancellation reason is required." },
        { status: 400 },
      );
    }
    const detail = typeof body.detail === "string" ? body.detail.trim() : "";

    const updated = await stripe.subscriptions.update(owner.agency.subscriptionId, {
      cancel_at_period_end: true,
      cancellation_details: {
        feedback: feedbackForReason(normalizedReason),
        comment: detail || undefined,
      },
      expand: ["discounts", "items.data.price"],
    });

    await db
      .collection(`agencies/${owner.agencyId}/billingFeedback`)
      .add({
        action: "cancel_requested",
        reason: normalizedReason,
        detail: detail || null,
        currentPlanKey: summarizeSubscription(updated).currentPlanKey,
        currentPlanName: summarizeSubscription(updated).currentPlanName,
        createdAt: FieldValue.serverTimestamp(),
        createdByUid: owner.uid,
        createdByEmail: owner.email,
      });

    return NextResponse.json(
      responseForSummary(await summarizeAgencyBilling(updated)),
    );
  }

  return NextResponse.json({ error: "Unknown billing action." }, { status: 400 });
}
