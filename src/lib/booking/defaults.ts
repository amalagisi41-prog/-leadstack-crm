import {
  DEFAULT_MIN_NOTICE_HOURS,
  DEFAULT_REMINDER_OFFSETS_MINUTES,
  DEFAULT_VISIBLE_DAYS,
  type BookingPageFormData,
  type WorkingHour,
} from "@/types/booking";

/**
 * Shared defaults consumed by the editor's "new page" form and the API
 * create route. Single source of truth so a fresh booking page hydrates
 * with the same shape the validator emits.
 */

/** Monday–Friday 9am–5pm in the page's timezone. */
export function defaultWorkingHours(): WorkingHour[] {
  // dayOfWeek: 0=Sun … 6=Sat (JS Date convention).
  return [1, 2, 3, 4, 5].map((d) => ({
    dayOfWeek: d as WorkingHour["dayOfWeek"],
    startMinute: 9 * 60, // 9:00
    endMinute: 17 * 60, // 17:00
  }));
}

/**
 * Hydration shape for a brand-new booking page. The editor uses this as
 * the form's initial state; the API uses it to fill defaults for any
 * field the editor doesn't send.
 */
export function defaultBookingPageFormData(
  slug: string,
  timezone: string,
): BookingPageFormData {
  return {
    slug,
    name: "30-minute consultation",
    description: "",
    status: "draft",
    durationMinutes: 30,
    bufferMinutes: 0,
    workingHours: defaultWorkingHours(),
    timezone,
    visibleDays: DEFAULT_VISIBLE_DAYS,
    minNoticeHours: DEFAULT_MIN_NOTICE_HOURS,
    maxPerDay: null,
    intakeFields: [],
    logoUrl: null,
    accentColor: null,
    meetingUrl: null,
    confirmationMessage: "",
    redirectUrl: null,
    redirectAppendParams: true,
    remindersEnabled: true,
    reminderOffsetsMinutes: [...DEFAULT_REMINDER_OFFSETS_MINUTES],
    payment: null,
    defaultTerritoryId: null,
  };
}

/**
 * Best-effort timezone resolver for the create form. We attempt the
 * runtime's resolvedOptions first (operator's browser tz in client
 * components, server tz on server components — both reasonable
 * defaults) and fall back to UTC if it's not available.
 */
export function detectTimezone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz) return tz;
  } catch {
    /* fall through */
  }
  return "UTC";
}
