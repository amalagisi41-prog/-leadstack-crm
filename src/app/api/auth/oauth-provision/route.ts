import "server-only";

import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { provisionNewAgency } from "@/lib/auth/provision-agency";
import { resolveAgencyAccess } from "@/lib/auth/resolve-agency-access";
import { getStripeServer } from "@/lib/stripe/server";
import { planPriceId } from "@/lib/stripe/catalog";

async function createOwnerCheckout({
  uid,
  email,
  agencyId,
}: {
  uid: string;
  email: string;
  agencyId: string;
}) {
  const priceId = planPriceId("starter");
  if (!priceId) {
    throw new Error("The Solo plan isn't configured on this deployment yet.");
  }

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
  if (!appUrl) {
    throw new Error("NEXT_PUBLIC_APP_URL is not configured.");
  }

  const session = await getStripeServer().checkout.sessions.create({
    mode: "subscription",
    payment_method_types: ["card"],
    customer_email: email,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${appUrl}/agency/get-started?checkout=success`,
    cancel_url: `${appUrl}/signup?checkout=cancelled`,
    metadata: {
      mode: "existing_agency",
      uid,
      agencyId,
      planKey: "starter",
      priceId,
    },
  });

  if (!session.url) {
    throw new Error("Could not start checkout. Try again.");
  }
  return session.url;
}

export async function POST(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const idToken = authorization.startsWith("Bearer ")
    ? authorization.slice(7)
    : "";
  if (!idToken) {
    return NextResponse.json({ error: "Missing identity token." }, { status: 401 });
  }

  const auth = getAdminAuth();
  const decoded = await auth.verifyIdToken(idToken).catch(() => null);
  if (!decoded?.uid || !decoded.email) {
    return NextResponse.json({ error: "Invalid social sign-in." }, { status: 401 });
  }

  const uid = decoded.uid;
  const email = decoded.email.trim().toLowerCase();
  const resolved = await resolveAgencyAccess(uid);
  if (resolved) {
    const legacyRole =
      resolved.agencyRole === "owner" ? "admin" : "collaborator";

    // Repair stale/missing tenancy claims whenever an existing user signs in.
    // This is especially important after Firebase Admin credentials are fixed:
    // the account may exist while the browser token still lacks agencyId.
    await auth.setCustomUserClaims(uid, {
      role: legacyRole,
      status: resolved.status,
      agencyId: resolved.agencyId,
      agencyRole: resolved.agencyRole,
    });

    if (resolved.agencyRole === "owner" && resolved.agencyId) {
      const agencyId = resolved.agencyId;
      const agencySnap = await getAdminDb()
        .doc(`agencies/${agencyId}`)
        .get();
      const subscriptionStatus = agencySnap.data()?.subscriptionStatus;
      if (subscriptionStatus !== "active" && subscriptionStatus !== "trialing") {
        return NextResponse.json({
          redirectTo: await createOwnerCheckout({
            uid,
            email,
            agencyId,
          }),
          existing: true,
          agencyId: resolved.agencyId,
          recoveredAgencyId: resolved.repairedPrimaryAgencyId,
        });
      }
    }

    return NextResponse.json({
      redirectTo: resolved.agencyRole === "owner" ? "/agency" : "/dashboard",
      existing: true,
      agencyId: resolved.agencyId,
      recoveredAgencyId: resolved.repairedPrimaryAgencyId,
    });
  }

  const userRecord = await auth.getUser(uid);
  const displayName =
    userRecord.displayName?.trim() || email.split("@")[0] || "AgentStack user";

  let provisioned: { agencyId: string; subAccountId: string };
  try {
    provisioned = await provisionNewAgency({
      uid,
      email,
      displayName,
      bootstrap: false,
      // Google/Apple sign-in already confirms the address with the
      // provider, so Firebase sets emailVerified=true itself — this is a
      // no-op in practice, kept true for consistency with the other
      // brand-new-account paths.
      requiresEmailVerification: true,
    });
  } catch (error) {
    await auth.deleteUser(uid).catch(() => undefined);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not create your beta workspace.",
      },
      { status: 500 },
    );
  }

  try {
    return NextResponse.json({
      redirectTo: await createOwnerCheckout({
        uid,
        email,
        agencyId: provisioned.agencyId,
      }),
      agencyId: provisioned.agencyId,
      subAccountId: provisioned.subAccountId,
      existing: false,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not create your beta workspace.",
      },
      { status: 500 },
    );
  }
}
