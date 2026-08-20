import type { BusinessProfileContent } from "@/types/business-profile";
import type { BookingPageFormData, WorkingHour } from "@/types/booking";

/**
 * Apply only approved Blueprint defaults to a booking draft. Existing values
 * are intentionally preserved so an assistant action can never erase edits.
 */
export function prefillBookingFromBlueprint(
  form: BookingPageFormData,
  profile: BusinessProfileContent,
): BookingPageFormData {
  const next = { ...form };
  const name = profile.agentName.trim();
  if (name && (!form.name.trim() || form.name === "30-minute consultation")) {
    next.name = `30-minute consultation with ${name}`.slice(0, 80);
  }
  if (!form.description.trim()) {
    const source = profile.clientPromise.trim() || profile.bio.trim();
    if (source) next.description = source.slice(0, 2000);
  }
  if (!form.logoUrl && profile.logoUrl.trim()) next.logoUrl = profile.logoUrl.trim();
  if (!form.confirmationMessage.trim()) {
    next.confirmationMessage = `Thanks — ${name || "we"} will be in touch shortly.`;
  }
  const parsedHours = parseBusinessHours(profile.businessHours);
  if (parsedHours.length > 0 && isDefaultWeekdaySchedule(form.workingHours)) {
    next.workingHours = parsedHours;
  }
  return next;
}

function isDefaultWeekdaySchedule(hours: WorkingHour[]): boolean {
  return (
    hours.length === 5 &&
    hours.every(
      (h, i) =>
        h.dayOfWeek === i + 1 && h.startMinute === 540 && h.endMinute === 1020,
    )
  );
}

/** Parse common Blueprint values such as "Mon–Fri 9–6, Sat by appointment". */
export function parseBusinessHours(value: string): WorkingHour[] {
  const text = value.trim().toLowerCase();
  if (!text) return [];
  const match = text.match(/(mon(?:day)?\s*[–-]\s*fri(?:day)?|weekdays?)\s+(\d{1,2})(?::(\d{2}))?\s*[–-]\s*(\d{1,2})(?::(\d{2}))?/);
  if (!match) return [];
  const start = toMinutes(Number(match[2]), Number(match[3] ?? 0), text.slice(match.index!));
  let end = toMinutes(Number(match[4]), Number(match[5] ?? 0), text.slice(match.index!));
  // Human-readable business hours commonly omit am/pm ("9–6"). Treat an
  // end hour that precedes the start as a same-day afternoon close.
  if (end != null && start != null && end <= start && end < 12 * 60) end += 12 * 60;
  if (start == null || end == null || start >= end) return [];
  return [1, 2, 3, 4, 5].map((day) => ({
    dayOfWeek: day as WorkingHour["dayOfWeek"],
    startMinute: start,
    endMinute: end,
  }));
}

function toMinutes(hour: number, minute: number, context: string): number | null {
  if (!Number.isInteger(hour) || hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  const pm = /pm/.test(context);
  const normalized = hour <= 12 && pm && hour < 12 ? hour + 12 : hour;
  return normalized * 60 + minute;
}
