import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { reconcileContactFromCapture } from "@/lib/comms/ai/capture";
import { createIdxInquiryFollowUp } from "@/lib/idx/inquiry-follow-up";
import type { SubAccountDoc } from "@/types";
import type { IdxListingDoc } from "@/types/idx";

/**
 * Public "Request a showing" submission — POST
 * /api/idx/[subAccountId]/[listingId]/inquire. No auth: this is the
 * recipient-facing form on a public listing detail page.
 *
 * Reconciles a Contact (email-first — visitors type emails deliberately,
 * same strategy Web Chat uses), creates a follow-up Task + escalation
 * email via `createIdxInquiryFollowUp`, and writes a contact activity row.
 * The lead-capture payoff is the actual point of the whole IDX Listings
 * feature — every listing view is a lead-gen surface.
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

interface InquireBody {
  name?: string;
  email?: string;
  phone?: string;
  message?: string;
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ subAccountId: string; listingId: string }> }
) {
  const { subAccountId, listingId } = await ctx.params;

  let body: InquireBody;
  try {
    body = (await request.json()) as InquireBody;
  } catch {
    return jsonWithCors({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = (body.name ?? "").toString().trim().slice(0, 200);
  const email = (body.email ?? "")
    .toString()
    .trim()
    .toLowerCase()
    .slice(0, 200);
  const phone = (body.phone ?? "").toString().trim().slice(0, 40);
  const message = (body.message ?? "").toString().trim().slice(0, 2000);

  if (!name || !email) {
    return jsonWithCors(
      { error: "Please enter your name and email." },
      { status: 400 }
    );
  }

  const db = getAdminDb();
  const [subSnap, listingSnap] = await Promise.all([
    db.doc(`subAccounts/${subAccountId}`).get(),
    db.doc(`subAccounts/${subAccountId}/idxListings/${listingId}`).get(),
  ]);
  if (!subSnap.exists || !listingSnap.exists) {
    return jsonWithCors(
      { error: "This listing is unavailable." },
      { status: 404 }
    );
  }
  const sub = subSnap.data() as SubAccountDoc;
  if (sub.idxEnabledByAgency !== true || !sub.idxConfig?.enabled) {
    return jsonWithCors(
      { error: "This listing is unavailable." },
      { status: 404 }
    );
  }
  const listing = listingSnap.data() as IdxListingDoc;
  const agencyId = sub.agencyId;

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://agentstackcrm.app";
  const listingUrl = `${appUrl}/idx/${subAccountId}/${listingId}`;

  let contactId: string;
  try {
    const reconciled = await reconcileContactFromCapture({
      agencyId,
      subAccountId,
      existingContactId: null,
      pageUrl: listingUrl,
      source: "idx-listing",
      matchStrategy: "email-first",
      capture: {
        name: name || null,
        email: email || null,
        phone: phone || null,
      },
    });
    if (!reconciled) {
      return jsonWithCors(
        { error: "Please enter your name and email." },
        { status: 400 }
      );
    }
    contactId = reconciled.contactId;
  } catch (err) {
    console.error("[idx/inquire] contact reconcile failed", err);
    return jsonWithCors(
      { error: "We couldn't save your request. Please try again." },
      { status: 500 }
    );
  }

  // Best-effort follow-up (Task + escalation email) — never blocks the
  // visitor's confirmation.
  await createIdxInquiryFollowUp({
    agencyId,
    subAccountId,
    contactId,
    listing: {
      id: listing.id,
      address: listing.address,
      city: listing.city,
      state: listing.state,
      price: listing.price,
    },
    inquirerName: name || null,
    inquirerEmail: email || null,
    inquirerPhone: phone || null,
    message: message || null,
    listingUrl,
  }).catch((err) => {
    console.error("[idx/inquire] follow-up failed", err);
  });

  // Best-effort activity row — never blocks the visitor's confirmation.
  try {
    await db
      .collection("contacts")
      .doc(contactId)
      .collection("activities")
      .add({
        type: "idx_listing_inquiry",
        content: `Requested a showing for ${listing.address || "a listing"}`,
        createdBy: "idx-listing",
        meta: { listingId, listingUrl },
        createdAt: FieldValue.serverTimestamp(),
      });
  } catch (err) {
    console.warn("[idx/inquire] activity write failed", err);
  }

  return jsonWithCors({ ok: true });
}
