import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { createContactServerSide } from "@/lib/server/contacts-service";
import { createDealServerSide } from "@/lib/server/deals-service";
import {
  EMPTY_LOCATION,
  ipFromRequest,
  locationFromIp,
  locationFromPhone,
  mergeLocation,
} from "@/lib/contacts/location";
import { getFunnelGoal } from "@/lib/funnels/catalog";
import type { FunnelDoc } from "@/types/funnel";

/**
 * Public funnel submission — POST /api/l/[subAccountId]/[slug]/submit.
 *
 * No auth: this is the recipient-facing form on a published funnel. Creates
 * a contact via `createContactServerSide` (so `contact.created` fires and the
 * lead flows into pipelines + role-snapshot workflows exactly like a form
 * submit does), stamps `source: "funnel"`, and bumps the funnel's counter.
 */

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

function jsonWithCors(body: unknown, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: { ...(init?.headers ?? {}), ...CORS_HEADERS },
  });
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ subAccountId: string; slug: string }> },
) {
  const { subAccountId, slug } = await ctx.params;

  let body: { name?: string; email?: string; phone?: string };
  try {
    body = await request.json();
  } catch {
    return jsonWithCors({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = (body.name ?? "").toString().trim().slice(0, 200);
  const email = (body.email ?? "").toString().trim().toLowerCase().slice(0, 200);
  const phone = (body.phone ?? "").toString().trim().slice(0, 40);

  if (!name) {
    return jsonWithCors({ error: "Please enter your name." }, { status: 400 });
  }

  const db = getAdminDb();

  // Resolve the funnel by slug within the sub-account; must be published.
  const funnelSnap = await db
    .collection(`subAccounts/${subAccountId}/funnels`)
    .where("slug", "==", slug)
    .limit(1)
    .get();
  if (funnelSnap.empty) {
    return jsonWithCors({ error: "This page is unavailable." }, { status: 404 });
  }
  const funnelRef = funnelSnap.docs[0].ref;
  const funnel = funnelSnap.docs[0].data() as FunnelDoc;
  if (funnel.status !== "published") {
    return jsonWithCors({ error: "This page is unavailable." }, { status: 404 });
  }

  const agencyId = funnel.agencyId;
  if (!agencyId) {
    return jsonWithCors(
      { error: "Funnel is missing tenancy metadata." },
      { status: 500 },
    );
  }

  // Require whatever the funnel says it collects.
  if (funnel.content.collectEmail && !email) {
    return jsonWithCors({ error: "Please enter your email." }, { status: 400 });
  }
  if (funnel.content.collectPhone && !phone) {
    return jsonWithCors(
      { error: "Please enter your phone number." },
      { status: 400 },
    );
  }

  // Best-effort location (same soft-fail strategy as the form-submit route).
  const ip = ipFromRequest(request);
  const [ipLoc, phoneLoc] = await Promise.all([
    ip ? locationFromIp(ip) : Promise.resolve(EMPTY_LOCATION),
    Promise.resolve(locationFromPhone(phone)),
  ]);
  const location = mergeLocation(ipLoc, phoneLoc);

  const goal = getFunnelGoal(funnel.content.goal);

  let contactId: string;
  try {
    const result = await createContactServerSide({
      subAccountId,
      agencyId,
      createdByUid: funnel.createdByUid || "funnel-submission",
      mode: "live",
      name,
      email,
      phone,
      company: "",
      address: "",
      source: "funnel",
      // Tag with the funnel name so operators can segment leads by campaign.
      tags: [`funnel:${funnel.name}`.slice(0, 60), goal.label].filter(Boolean),
      location: {
        countryCode: location.countryCode,
        country: location.country,
        city: location.city,
        lat: location.lat,
        lng: location.lng,
      },
    });
    contactId = result.id;
  } catch (err) {
    console.error("[funnel/submit] contact create failed", err);
    return jsonWithCors(
      { error: "We couldn't save your details. Please try again." },
      { status: 500 },
    );
  }

  // Optional: also open a deal (parity with Forms' createDeal setting).
  // Best-effort — a failure here shouldn't fail the visitor's submission,
  // the contact is already saved.
  if (funnel.content.createDeal) {
    try {
      const title =
        (funnel.content.dealTitleTemplate || "New lead — {{name}}").replace(
          /\{\{name\}\}/g,
          name,
        ) || "New lead";
      await createDealServerSide({
        subAccountId,
        agencyId,
        createdByUid: funnel.createdByUid || "funnel-submission",
        mode: "live",
        title,
        value: funnel.content.dealValue || 0,
        currency: "USD",
        contactId,
        stageId: "new",
        priority: "medium",
      });
    } catch (err) {
      console.error("[funnel/submit] deal create failed", err);
    }
  }

  // Bump the funnel's submission counter (best-effort).
  try {
    await funnelRef.update({
      submissionCount: FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp(),
    });
  } catch {
    // Non-fatal — the lead is already captured.
  }

  return jsonWithCors({
    ok: true,
    thankYouMessage: funnel.content.thankYouMessage,
  });
}
