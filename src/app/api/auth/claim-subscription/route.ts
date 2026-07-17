import "server-only";

import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { provisionNewAgency } from "@/lib/auth/provision-agency";

/**
 * Redeems the claim token minted by `/api/checkout/subscribe` and hashed
 * by `lib/stripe/webhooks.ts::handleNewAgencyCheckout` once payment
 * completes — the "claim your workspace" counterpart to the claim-token
 * pattern CLAUDE.md documents for the (unused-in-this-clone) GitHub-invite
 * flow. No attempt-lock / rate-limit here unlike that flow: the token is
 * 32 random bytes (256 bits) end to end, so brute-forcing it is already
 * infeasible — the GitHub flow's extra guards existed for a different,
 * shorter-entropy threat model.
 *
 * GET  — status check the /welcome page uses before showing the form:
 *        is the purchase doc there yet (webhook may not have landed),
 *        is the token valid, has it already been claimed.
 * POST — the actual claim: create the Firebase Auth user, provision a
 *        fresh agency via provisionNewAgency(), stamp billing fields, flip
 *        any purchased add-on gates, mark the purchase claimed.
 */

interface PurchaseDoc {
  mode?: string;
  kind?: string;
  email?: string;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  planPriceId?: string | null;
  addOnGates?: string[];
  claimTokenHash?: string;
  claimExpiresAt?: Timestamp | null;
  claimed?: boolean;
}

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token, "utf8").digest("hex");
}

async function loadPurchase(sessionId: string, token: string) {
  const ref = getAdminDb().collection("purchases").doc(sessionId);
  const snap = await ref.get();
  if (!snap.exists) return { ref, purchase: null as PurchaseDoc | null, valid: false, expired: false };
  const purchase = snap.data() as PurchaseDoc;
  // Purchases created before claim expiry shipped have no claimExpiresAt —
  // treat as never-expiring rather than already-expired.
  const expired = !!purchase.claimExpiresAt && purchase.claimExpiresAt.toMillis() < Date.now();
  const valid =
    !expired &&
    purchase.mode === "new_agency" &&
    !!purchase.claimTokenHash &&
    purchase.claimTokenHash === hashToken(token);
  return { ref, purchase, valid, expired };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const sessionId = url.searchParams.get("session_id");
  const token = url.searchParams.get("t");
  if (!sessionId || !token) {
    return NextResponse.json({ error: "Missing session_id or t" }, { status: 400 });
  }

  const { purchase, valid, expired } = await loadPurchase(sessionId, token);
  if (!purchase) {
    // Webhook may not have landed yet — race-condition safe, same pattern
    // documented for the founders/GitHub-invite flow. Client auto-retries.
    return NextResponse.json({ ready: false }, { status: 425 });
  }
  if (!valid) {
    // A reminder with a fresh link is emailed ~24h after purchase if still
    // unclaimed (see /api/checkout/claim-reminder/step) — surface that so
    // an expired visit isn't a dead end.
    return NextResponse.json(
      {
        error: expired
          ? "This link has expired. Check your email for a newer one, or contact support."
          : "Invalid or expired link.",
        expired,
      },
      { status: 403 },
    );
  }
  if (purchase.claimed) {
    return NextResponse.json({ ready: true, claimed: true, email: purchase.email ?? null });
  }
  return NextResponse.json({ ready: true, claimed: false, email: purchase.email ?? null });
}

interface ClaimBody {
  sessionId?: string;
  token?: string;
  password?: string;
  displayName?: string;
}

export async function POST(request: Request) {
  let body: ClaimBody;
  try {
    body = (await request.json()) as ClaimBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const sessionId = body.sessionId;
  const token = body.token;
  if (!sessionId || !token) {
    return NextResponse.json(
      { error: "sessionId and token are required." },
      { status: 400 },
    );
  }

  const password = body.password;
  if (!password || password.length < 6) {
    return NextResponse.json(
      { error: "Password must be at least 6 characters." },
      { status: 400 },
    );
  }

  const { ref: purchaseRef, purchase, valid, expired } = await loadPurchase(sessionId, token);
  if (!purchase) {
    return NextResponse.json({ error: "Purchase not found yet — try again shortly." }, { status: 425 });
  }
  if (!valid) {
    return NextResponse.json(
      {
        error: expired
          ? "This link has expired. Check your email for a newer one, or contact support."
          : "Invalid or expired link.",
        expired,
      },
      { status: 403 },
    );
  }
  if (purchase.claimed) {
    return NextResponse.json(
      { error: "This workspace was already claimed. Sign in instead." },
      { status: 409 },
    );
  }

  // The email is fixed to whatever Stripe verified at checkout — never
  // trust a client-supplied override here.
  const email = purchase.email?.trim().toLowerCase();
  if (!email) {
    return NextResponse.json({ error: "No email on file for this purchase." }, { status: 500 });
  }
  const displayName = body.displayName?.trim() || email.split("@")[0];

  const auth = getAdminAuth();
  let uid: string;
  try {
    const userRecord = await auth.createUser({ email, password, displayName });
    uid = userRecord.uid;
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "auth/email-already-exists") {
      return NextResponse.json(
        { error: "An account already exists for this email. Sign in instead." },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not create account." },
      { status: 500 },
    );
  }

  try {
    const { agencyId, subAccountId } = await provisionNewAgency({
      uid,
      email,
      displayName,
      bootstrap: false,
      requiresEmailVerification: true,
    });

    const db = getAdminDb();
    await db.doc(`agencies/${agencyId}`).update({
      stripeCustomerId: purchase.stripeCustomerId ?? null,
      subscriptionId: purchase.stripeSubscriptionId ?? null,
      subscriptionStatus: "active",
      subscriptionPriceId: purchase.planPriceId ?? null,
      updatedAt: FieldValue.serverTimestamp(),
    });

    const addOnGates = Array.isArray(purchase.addOnGates) ? purchase.addOnGates : [];
    if (addOnGates.length > 0) {
      const gateUpdate: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
      for (const gate of addOnGates) gateUpdate[gate] = true;
      await db.doc(`subAccounts/${subAccountId}`).update(gateUpdate);
    }

    await purchaseRef.update({
      claimed: true,
      claimedAt: FieldValue.serverTimestamp(),
      claimedByUid: uid,
    });

    return NextResponse.json({
      uid,
      email,
      agencyId,
      subAccountId,
      redirectTo: "/agency/get-started",
    });
  } catch (err) {
    await auth.deleteUser(uid).catch(() => undefined);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not finish setting up your workspace." },
      { status: 500 },
    );
  }
}
