import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import {
  requireSubAccountAdmin,
  requireSubAccountMember,
} from "@/lib/auth/require-tenancy";
import { validateBookingPageFormData } from "@/lib/booking/validation";
import { resolveBookingHosts } from "@/lib/booking/hosts";
import { GLOBAL_TERRITORY_ID } from "@/types";
import type { BookingPage } from "@/types/booking";

/**
 * Booking-page CRUD per sub-account.
 *
 * GET  — list every booking page in the sub-account. Visible to any
 *        active member so collaborators can see/share public links.
 *        Reads also flow over the client SDK + Firestore rules — this
 *        route exists for server-side renderers and integration tests.
 * POST — create a new booking page. Sub-account admin only. Slug must
 *        be globally unique within the sub-account; the slug doubles as
 *        the Firestore doc id so collisions are detected by doc.create.
 */
export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const snap = await getAdminDb()
    .collection(`subAccounts/${subAccountId}/bookingPages`)
    .get();
  const pages = snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<BookingPage, "id">) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return NextResponse.json({ ok: true, pages });
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const validated = validateBookingPageFormData(body);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }
  const data = validated.value;

  const db = getAdminDb();
  const subSnap = await db.doc(`subAccounts/${subAccountId}`).get();
  if (!subSnap.exists) {
    return NextResponse.json({ error: "Sub-account not found" }, { status: 404 });
  }
  const sub = subSnap.data() ?? {};
  const agencyId = (sub.agencyId as string | undefined) ?? null;
  if (!agencyId) {
    return NextResponse.json(
      { error: "Sub-account is missing tenancy metadata." },
      { status: 500 },
    );
  }

  // Reject payment block when the sub-account has no PayPal.me connected
  // — the public page would render a Pay button that goes nowhere.
  if (data.payment && !sub.paypalConfig) {
    return NextResponse.json(
      {
        error:
          "Connect a PayPal.me username under Settings → Payments before requiring payment on a booking page.",
      },
      { status: 400 },
    );
  }

  // Defensively land the territoryId — Global by default so the
  // no-unassigned invariant holds even when scoping is off.
  const territoryId =
    data.defaultTerritoryId &&
    data.defaultTerritoryId !== GLOBAL_TERRITORY_ID
      ? data.defaultTerritoryId
      : GLOBAL_TERRITORY_ID;

  // Resolve the requested hosts against live membership — keep only active
  // members + re-snapshot their display names (don't trust client names).
  const hosts = await resolveBookingHosts(subAccountId, data.hosts);

  // Doc id == slug → atomic uniqueness check via create().
  const ref = db.doc(
    `subAccounts/${subAccountId}/bookingPages/${data.slug}`,
  );
  const now = FieldValue.serverTimestamp();
  const docPayload = {
    ...data,
    hosts,
    id: data.slug,
    agencyId,
    subAccountId,
    createdByUid: access.uid,
    territoryId,
    createdAt: now,
    updatedAt: now,
  };
  try {
    await ref.create(docPayload);
  } catch (err) {
    // Firestore raises ALREADY_EXISTS (code 6) on create when the doc
    // exists. Surface as 409 so the editor can prompt for a different slug.
    const code =
      typeof err === "object" && err !== null && "code" in err
        ? (err as { code?: number | string }).code
        : null;
    if (code === 6 || code === "already-exists") {
      return NextResponse.json(
        {
          error: `A booking page with the slug "${data.slug}" already exists. Pick another.`,
        },
        { status: 409 },
      );
    }
    throw err;
  }

  return NextResponse.json({ ok: true, slug: data.slug });
}
