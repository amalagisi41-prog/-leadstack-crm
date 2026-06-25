import type { Timestamp, FieldValue } from "firebase/firestore";

/**
 * Native booking pages — sub-account-level config docs that power the
 * public /b/[saId]/[slug] surface. Each doc describes one bookable
 * offering (e.g. "30-min consultation", "Strategy call"); a sub-account
 * can publish many. Lives at `subAccounts/{saId}/bookingPages/{slug}` —
 * subcollection so per-sub-account scopes are cheap to query.
 *
 * Off-by-default contract mirrors the existing territory + email-domain
 * features: sub-accounts that don't create a booking page see only an
 * empty "Booking" tab in the sidebar — no other behavior changes.
 *
 * Visibility model: all fields are admin-managed via Admin-SDK API
 * routes. Public booking pages read this doc server-side (Admin SDK
 * bypass) so Firestore rules can stay member-scoped.
 */

/** Lifecycle of a booking page. Only `published` pages are reachable at /b/. */
export type BookingPageStatus = "draft" | "published";

/**
 * A single working-hour range within a day, expressed in the page's
 * `timezone`. Days can carry multiple ranges (e.g. 9-12, 13-17 to model
 * a lunch break). Days with no entry are unavailable.
 */
export interface WorkingHour {
  /** 0 = Sunday … 6 = Saturday (JS Date convention). */
  dayOfWeek: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  /** Minutes from midnight in the page's timezone. 0 ≤ startMinute < endMinute ≤ 1440. */
  startMinute: number;
  endMinute: number;
}

/**
 * An extra question shown on the public booking form, beyond the
 * mandatory name / email / phone. v1 supports plain text, multi-line
 * text, and single-select. Operators usually want one or two ("What
 * would you like to discuss?", "How did you hear about us?").
 */
export interface IntakeField {
  /** Local id (stable across edits). Used as the form field name + answer key. */
  id: string;
  label: string;
  type: "text" | "textarea" | "select";
  required: boolean;
  /** Required when type === "select". Free-form labels; rendered verbatim. */
  options: string[] | null;
}

/**
 * A bookable team host on a booking page. When a page carries one or more
 * hosts it runs in "team mode": availability is the UNION of each host's
 * free time (a slot stays open while ANY host is free), and each booking is
 * auto-assigned to the least-loaded free host at book time (stamped on the
 * event's `assignedToUid` / `assignedToName`). Empty/absent ⇒ legacy single
 * shared schedule, no host stamped. `name` is a snapshot of the member's
 * `displayName`, re-snapshotted from the live member doc on every save.
 */
export interface BookingHost {
  /** Firebase Auth uid of an active sub-account member. */
  uid: string;
  /** Display name snapshot (for the internal calendar + ICS, no lookup needed). */
  name: string;
}

/**
 * Optional PayPal.me deposit gate per booking page. When set, the slot
 * holds in `awaiting_payment` until the operator confirms the payment
 * landed in their PayPal account (manual flip — PayPal.me has no
 * webhook). After `holdHours`, an unpaid hold auto-cancels and frees
 * the slot. Uses the sub-account's existing `paypalConfig.username`.
 */
export interface BookingPayment {
  /** Major currency units (e.g. dollars, not cents). */
  amount: number;
  /** ISO 4217. Validated at API layer; matches the existing quotes/invoices set. */
  currency: string;
  /** Operator-facing reason shown on the public page (e.g. "Consultation deposit"). */
  description: string | null;
  /** Auto-expire unpaid holds after this many hours. Default 24. */
  holdHours: number;
}

export interface BookingPage {
  id: string;
  /** Lower-case kebab-case URL segment. Unique per sub-account. */
  slug: string;
  /** Operator-facing name + public-page heading. */
  name: string;
  /** Markdown shown on the public page above the slot picker. */
  description: string;
  status: BookingPageStatus;

  // ── Slot rules ─────────────────────────────────────────────────
  durationMinutes: number;
  /** Gap between back-to-back meetings, in minutes. 0 allowed. */
  bufferMinutes: number;
  workingHours: WorkingHour[];
  /** IANA timezone, e.g. "Australia/Sydney". */
  timezone: string;
  /** Future window of bookable days from "now". Default 14. */
  visibleDays: number;
  /** Minimum lead time before a slot can be booked. Default 2. */
  minNoticeHours: number;
  /** Cap on bookings per day. `null` = unlimited. */
  maxPerDay: number | null;

  // ── Intake form (extras on top of mandatory name/email/phone) ──
  intakeFields: IntakeField[];

  // ── Team hosts (round-robin) ──────────────────────────────────
  /**
   * Bookable hosts. Non-empty ⇒ team mode (per-host union availability +
   * least-loaded auto-assignment at book time). Empty/absent ⇒ single
   * shared schedule (today's behavior, no host stamped). See {@link BookingHost}.
   */
  hosts?: BookingHost[];

  // ── Visual overrides ──────────────────────────────────────────
  /** Overrides `subAccount.logoUrl` on the public page. */
  logoUrl: string | null;
  /** Hex string. Overrides brand on the public page. */
  accentColor: string | null;

  // ── Meeting link ──────────────────────────────────────────────
  /**
   * Optional video-call URL attached to every booking made on this page —
   * Zoom personal meeting link, Google Meet permanent room, Whereby URL,
   * etc. Snapshotted onto each `events/{id}` doc at booking time (so
   * editing the page later doesn't rewrite historical events). Rendered
   * as a "Join the meeting" CTA in the confirmation + reminder emails,
   * stamped as the .ics `LOCATION` (where Calendar apps auto-render a
   * native "join" button), and shown on the visitor's /e/[token] page.
   * `null` = in-person or "we'll send the link separately".
   *
   * Static — all bookings on this page share one URL. A v1.1 upgrade
   * (Zoom OAuth) replaces this with auto-generated per-meeting rooms.
   *
   * Optional on the type so legacy booking pages (created before this
   * field shipped) read as `undefined`; downstream code treats `?? null`
   * as "no meeting URL" consistently.
   */
  meetingUrl?: string | null;

  // ── Confirmation + reminders ──────────────────────────────────
  /** Markdown shown on the confirmation page after a successful booking. */
  confirmationMessage: string;
  /**
   * Optional URL the visitor is sent to after a confirmed booking (free
   * pages only — paid/awaiting-payment holds never redirect so the
   * PayPal CTA stays visible). The book route appends `booking_id` +
   * `email` query params for downstream conversion tracking, then the
   * public confirmation panel auto-navigates after a short countdown.
   * `null` = stay on the in-app confirmation panel (today's behaviour).
   *
   * Optional on the type so legacy booking pages (created before this
   * field shipped) read as `undefined`; downstream code treats `?? null`
   * as "no redirect" consistently.
   */
  redirectUrl?: string | null;
  /**
   * Whether the book route appends `booking_id` + `email` query params to
   * {@link redirectUrl}. On (default) powers pixel Advanced Matching /
   * conversion de-dup on the destination page; off sends the visitor to
   * the bare URL so the booker's email never lands in the destination's
   * referrer / logs / history. Only meaningful when `redirectUrl` is set.
   * Optional so legacy docs read as `undefined` → treated as `true`.
   */
  redirectAppendParams?: boolean;
  /** Master toggle for the T-24h + T-1h reminder pipeline. */
  remindersEnabled: boolean;
  /**
   * Offsets before the event when reminders fire, in minutes. v1 UI
   * exposes only the master toggle (fixed `[1440, 60]`); the doc shape
   * already supports per-page configuration so the v1.1 editor can
   * surface this without a migration.
   */
  reminderOffsetsMinutes: number[];

  // ── Payment (uses sub-account paypalConfig) ───────────────────
  payment: BookingPayment | null;

  // ── Territories (only meaningful when scopingEnabled) ─────────
  /**
   * Territory of the booking page config itself. Defaults to `"global"`
   * so the no-unassigned invariant holds even when scoping is off
   * (stored but ignored). Added to the territory-scoping enable
   * backfill list so sub-accounts that flip scoping on after creating
   * booking pages don't end up with untagged config docs.
   */
  territoryId: string;
  /**
   * Optional auto-tag for contacts created via this booking page. When
   * set, public booking landings receive `territoryId = defaultTerritoryId`
   * instead of the inbound-lead default (Global). Lets multi-territory
   * sub-accounts run regional pages (e.g. /b/.../sf-office tags new
   * leads into California). `null` = use the inbound-lead default.
   */
  defaultTerritoryId: string | null;

  // ── Tenancy ───────────────────────────────────────────────────
  agencyId: string;
  subAccountId: string;
  createdByUid: string;
  createdAt: Timestamp | FieldValue | null;
  updatedAt: Timestamp | FieldValue | null;
}

/**
 * Mutable subset used by the editor + admin CRUD API. Tenancy + lifecycle
 * timestamps are server-stamped, not client-controlled.
 */
export type BookingPageFormData = Pick<
  BookingPage,
  | "slug"
  | "name"
  | "description"
  | "status"
  | "durationMinutes"
  | "bufferMinutes"
  | "workingHours"
  | "timezone"
  | "visibleDays"
  | "minNoticeHours"
  | "maxPerDay"
  | "intakeFields"
  | "hosts"
  | "logoUrl"
  | "accentColor"
  | "meetingUrl"
  | "confirmationMessage"
  | "redirectUrl"
  | "redirectAppendParams"
  | "remindersEnabled"
  | "reminderOffsetsMinutes"
  | "payment"
  | "defaultTerritoryId"
>;

/** Default reminder offsets shipped with v1 — locked behind the boolean toggle. */
export const DEFAULT_REMINDER_OFFSETS_MINUTES: readonly number[] = [
  1440, // T-24h
  60, // T-1h
];

/** Default lookahead window for slot availability. */
export const DEFAULT_VISIBLE_DAYS = 14;

/** Default minimum notice (hours) before a slot becomes bookable. */
export const DEFAULT_MIN_NOTICE_HOURS = 2;

/** Default hold window when a payment gate is enabled. */
export const DEFAULT_PAYMENT_HOLD_HOURS = 24;
