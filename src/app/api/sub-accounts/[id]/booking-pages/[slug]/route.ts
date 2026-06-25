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
 * Per-booking-page operations.
 *
 * GET    — read the doc. Member-readable.
 * PATCH  — full-replace update of the editable fields. Sub-account admin
 *          only. Validates the entire payload (re-uses the create
 *          validator). Slug is immutable — changing the slug would break
 *          public links, so the route ignores any slug change and treats
 *          the URL param as canonical.
 * DELETE — hard-delete the page. Sub-account admin only. Blocked if any
 *          future events still reference this slug — operator must
 *          cancel them or wait them out, otherwise reschedule/cancel
 *          links in attendee inboxes silently break.
 */

export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string; slug: string }> },
) {
  const { id: subAccountId, slug } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const snap = await getAdminDb()
    .doc(`subAccounts/${subAccountId}/bookingPages/${slug}`)
    .get();
  if (!snap.exists) {
    return NextResponse.json({ error: "Booking page not found" }, { status: 404 });
  }
  return NextResponse.json({
    ok: true,
    page: { id: snap.id, ...(snap.data() as Omit<BookingPage, "id">) },
  });
}

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string; slug: string }> },
) {
  const { id: subAccountId, slug } = await ctx.params;
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Force the slug to match the URL — operators can't rename a slug via
  // PATCH because that would orphan public links + the
  // /e/[token] reschedule/cancel pages.
  const bodyWithSlug =
    typeof body === "object" && body !== null
      ? { ...(body as Record<string, unknown>), slug }
      : { slug };

  const validated = validateBookingPageFormData(bodyWithSlug);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }
  const data = validated.value;

  const db = getAdminDb();
  const ref = db.doc(`subAccounts/${subAccountId}/bookingPages/${slug}`);
  const snap = await ref.get();
  if (!snap.exists) {
    return NextResponse.json({ error: "Booking page not found" }, { status: 404 });
  }

  // Same payment gate as create — guard against requiring payment when
  // PayPal isn't connected. Edits that toggle payment on still need this.
  if (data.payment) {
    const subSnap = await db.doc(`subAccounts/${subAccountId}`).get();
    if (!subSnap.data()?.paypalConfig) {
      return NextResponse.json(
        {
          error:
            "Connect a PayPal.me username under Settings → Payments before requiring payment on a booking page.",
        },
        { status: 400 },
      );
    }
  }

  // Resolve hosts against live membership (active members only + fresh name
  // snapshot) — same as create, so a renamed/removed member is reconciled.
  const hosts = await resolveBookingHosts(subAccountId, data.hosts);

  // territoryId on the config doc stays stable across edits — operators
  // change it via the territory-retag route (future), not the booking
  // page editor. defaultTerritoryId IS editable here (it's a per-page
  // setting that tags inbound contacts).
  const patch = {
    ...data,
    hosts,
    territoryId: snap.data()?.territoryId ?? GLOBAL_TERRITORY_ID,
    updatedAt: FieldValue.serverTimestamp(),
  };
  await ref.update(patch);
  return NextResponse.json({ ok: true, slug });
}

export async function DELETE(
  request: Request,
  ctx: { params: Promise<{ id: string; slug: string }> },
) {
  const { id: subAccountId, slug } = await ctx.params;
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const db = getAdminDb();
  const ref = db.doc(`subAccounts/${subAccountId}/bookingPages/${slug}`);
  const snap = await ref.get();
  if (!snap.exists) {
    return NextResponse.json({ error: "Booking page not found" }, { status: 404 });
  }

  // Block delete when future bookings still reference the slug. Query by
  // the two equality filters only (no inequality on startAt) and count
  // future events in memory — same pattern as subscribeToBookingPageEvents.
  // This keeps the guard working even when the
  // events(subAccountId, bookingPageSlug, startAt) composite index hasn't
  // been deployed/built yet (an inequality + count aggregation would throw
  // FAILED_PRECONDITION and surface as a generic 500). Bookings per page
  // are bounded, so the in-memory scan is cheap.
  const nowMs = Date.now();
  let futureCount: number;
  try {
    const eventsSnap = await db
      .collection("events")
      .where("subAccountId", "==", subAccountId)
      .where("bookingPageSlug", "==", slug)
      .get();
    futureCount = eventsSnap.docs.filter((doc) => {
      const startAt = doc.get("startAt") as { toMillis?: () => number } | null;
      const ms = startAt?.toMillis?.();
      return typeof ms === "number" && ms >= nowMs;
    }).length;
  } catch (err) {
    console.error(
      `[booking-pages/delete] future-bookings check failed sa=${subAccountId} slug=${slug}`,
      err,
    );
    return NextResponse.json(
      { error: "Couldn't verify upcoming bookings. Please try again." },
      { status: 500 },
    );
  }
  if (futureCount > 0) {
    return NextResponse.json(
      {
        error: `Can't delete: ${futureCount} upcoming booking${
          futureCount === 1 ? "" : "s"
        } still use this page. Cancel them first, or unpublish the page to stop new bookings.`,
        futureCount,
      },
      { status: 409 },
    );
  }

  await ref.delete();
  return NextResponse.json({ ok: true, slug });
}
