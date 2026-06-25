import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import {
  validateBookingPageFormData,
  validateSlug,
} from "@/lib/booking/validation";
import { resolveBookingHosts } from "@/lib/booking/hosts";
import { GLOBAL_TERRITORY_ID } from "@/types";
import type { BookingPage, BookingPageFormData } from "@/types/booking";

/**
 * Duplicate a booking page (GHL-style "Clone Calendar").
 *
 * POST — copy an existing page's config into a brand-new DRAFT page in the
 *        same sub-account. Sub-account admin only. Everything carries over
 *        EXCEPT identity + lifecycle: the clone gets a fresh unique slug, a
 *        "Copy of …" name, `status: "draft"`, fresh tenancy stamps, and a
 *        new createdByUid. Past bookings (the `events` collection) are never
 *        touched — only the page config is cloned.
 *
 *        Mirrors the create route's invariants: slug doubles as the doc id
 *        (atomic uniqueness via create()), hosts are re-resolved against live
 *        membership, and the territoryId is landed defensively. The one
 *        divergence from create: if the source carried a payment gate but the
 *        sub-account no longer has PayPal connected, the clone DROPS the
 *        payment block + returns a `warning` rather than 400-ing — duplicating
 *        should never hard-fail on a config the operator can fix afterwards.
 */

/** Max length of a name (matches validateName) — leave room for the prefix. */
const NAME_MAX = 80;
const COPY_PREFIX = "Copy of ";
/** Max length of a slug (matches validateSlug). */
const SLUG_MAX = 48;
/** Bounded retry on slug collisions before falling back to a random suffix. */
const MAX_SLUG_ATTEMPTS = 25;

/** Prefix the name with "Copy of ", truncating so it stays within the cap. */
function copyName(sourceName: string): string {
  const room = NAME_MAX - COPY_PREFIX.length;
  return COPY_PREFIX + sourceName.slice(0, room).trim();
}

/**
 * Build a candidate slug for attempt N: "{base}-copy", "{base}-copy-2", …
 * The base is truncated + stripped of trailing hyphens so appending the
 * suffix always yields a slug that passes validateSlug (no trailing hyphen,
 * within the length cap).
 */
function copySlugCandidate(sourceSlug: string, attempt: number): string {
  const suffix = attempt <= 1 ? "-copy" : `-copy-${attempt}`;
  const base = sourceSlug
    .slice(0, SLUG_MAX - suffix.length)
    .replace(/-+$/, "");
  return `${base}${suffix}`;
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string; slug: string }> },
) {
  const { id: subAccountId, slug } = await ctx.params;
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const db = getAdminDb();

  // ── Load the source page ──────────────────────────────────────────
  const sourceSnap = await db
    .doc(`subAccounts/${subAccountId}/bookingPages/${slug}`)
    .get();
  if (!sourceSnap.exists) {
    return NextResponse.json(
      { error: "Booking page not found" },
      { status: 404 },
    );
  }
  const source = sourceSnap.data() as Omit<BookingPage, "id">;

  // ── Load the sub-account (tenancy + PayPal gate) ──────────────────
  const subSnap = await db.doc(`subAccounts/${subAccountId}`).get();
  if (!subSnap.exists) {
    return NextResponse.json(
      { error: "Sub-account not found" },
      { status: 404 },
    );
  }
  const sub = subSnap.data() ?? {};
  const agencyId = (sub.agencyId as string | undefined) ?? null;
  if (!agencyId) {
    return NextResponse.json(
      { error: "Sub-account is missing tenancy metadata." },
      { status: 500 },
    );
  }

  // ── Assemble the clone's form-data from the source ────────────────
  // Copy every editable field verbatim, then transform identity:
  // fresh name, drafted status (slug is set per-attempt below).
  let warning: string | null = null;
  let payment = source.payment ?? null;
  if (payment && !sub.paypalConfig) {
    // PayPal was disconnected after the source was built. Don't fail the
    // duplicate — drop the gate and tell the operator to re-add it.
    payment = null;
    warning =
      "Payment was removed from the copy — connect a PayPal.me username under Settings → Payments, then re-enable it on the new page.";
  }

  const draft: BookingPageFormData = {
    slug: copySlugCandidate(slug, 1), // re-validated below; replaced per attempt
    name: copyName(source.name),
    description: source.description ?? "",
    status: "draft",
    durationMinutes: source.durationMinutes,
    bufferMinutes: source.bufferMinutes,
    workingHours: source.workingHours,
    timezone: source.timezone,
    visibleDays: source.visibleDays,
    minNoticeHours: source.minNoticeHours,
    maxPerDay: source.maxPerDay,
    intakeFields: source.intakeFields ?? [],
    hosts: source.hosts ?? [],
    logoUrl: source.logoUrl ?? null,
    accentColor: source.accentColor ?? null,
    meetingUrl: source.meetingUrl ?? null,
    confirmationMessage: source.confirmationMessage ?? "",
    redirectUrl: source.redirectUrl ?? null,
    redirectAppendParams: source.redirectAppendParams ?? true,
    remindersEnabled: source.remindersEnabled,
    reminderOffsetsMinutes: source.reminderOffsetsMinutes,
    payment,
    defaultTerritoryId: source.defaultTerritoryId ?? null,
  };

  // Re-run the full validator so the clone is guaranteed schema-valid +
  // normalized exactly like a created page (belt-and-suspenders — the
  // source was already valid, but legacy docs may predate a bound).
  const validated = validateBookingPageFormData(draft);
  if (!validated.ok) {
    return NextResponse.json(
      { error: `Couldn't duplicate this page: ${validated.error}` },
      { status: 400 },
    );
  }
  const data = validated.value;

  // Re-resolve hosts against live membership (drop removed members, refresh
  // name snapshots) — identical to create/update.
  const hosts = await resolveBookingHosts(subAccountId, data.hosts);

  // Land territoryId defensively, same derivation as the create route.
  const territoryId =
    data.defaultTerritoryId && data.defaultTerritoryId !== GLOBAL_TERRITORY_ID
      ? data.defaultTerritoryId
      : GLOBAL_TERRITORY_ID;

  // ── Write under a fresh unique slug (atomic create + collision retry) ──
  const now = FieldValue.serverTimestamp();
  for (let attempt = 1; attempt <= MAX_SLUG_ATTEMPTS; attempt++) {
    const candidate =
      attempt < MAX_SLUG_ATTEMPTS
        ? copySlugCandidate(slug, attempt)
        : `${copySlugCandidate(slug, 1)}-${access.uid.slice(0, 6).toLowerCase()}`;

    const slugCheck = validateSlug(candidate);
    if (!slugCheck.ok) continue; // shouldn't happen, but skip a bad candidate
    const newSlug = slugCheck.value;

    const ref = db.doc(`subAccounts/${subAccountId}/bookingPages/${newSlug}`);
    try {
      await ref.create({
        ...data,
        slug: newSlug,
        hosts,
        id: newSlug,
        agencyId,
        subAccountId,
        createdByUid: access.uid,
        territoryId,
        createdAt: now,
        updatedAt: now,
      });
      return NextResponse.json({ ok: true, slug: newSlug, warning });
    } catch (err) {
      const code =
        typeof err === "object" && err !== null && "code" in err
          ? (err as { code?: number | string }).code
          : null;
      // ALREADY_EXISTS → try the next candidate slug; rethrow anything else.
      if (code === 6 || code === "already-exists") continue;
      throw err;
    }
  }

  return NextResponse.json(
    {
      error:
        "Couldn't find an available slug for the copy. Edit the original's slug or try again.",
    },
    { status: 409 },
  );
}
