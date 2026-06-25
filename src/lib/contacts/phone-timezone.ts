import { parsePhoneNumberFromString } from "libphonenumber-js";

/**
 * Map an ISO 3166-1 alpha-2 country code to a *representative* IANA
 * timezone, used to evaluate the outbound calling window in the contact's
 * own local time when we only know their phone number.
 *
 * IMPORTANT — this is an approximation. Large countries span several
 * zones (US, AU, RU, BR, CA, etc.); we pick one representative zone per
 * country. For those, the calling-window check can be off by a few hours
 * at the edges. Operators who need per-zone precision should tighten the
 * window. Single-zone countries are exact. Codes missing from the map
 * fall back to the caller-provided fallback (sub-account / agent timezone).
 *
 * Kept deliberately lean — extend as real calling markets appear.
 */
const COUNTRY_TZ: Record<string, string> = {
  AU: "Australia/Sydney",
  NZ: "Pacific/Auckland",
  US: "America/Chicago", // central as a middle-ground across US zones
  CA: "America/Toronto",
  GB: "Europe/London",
  IE: "Europe/Dublin",
  FR: "Europe/Paris",
  DE: "Europe/Berlin",
  ES: "Europe/Madrid",
  IT: "Europe/Rome",
  NL: "Europe/Amsterdam",
  BE: "Europe/Brussels",
  CH: "Europe/Zurich",
  AT: "Europe/Vienna",
  SE: "Europe/Stockholm",
  NO: "Europe/Oslo",
  DK: "Europe/Copenhagen",
  FI: "Europe/Helsinki",
  PT: "Europe/Lisbon",
  PL: "Europe/Warsaw",
  CZ: "Europe/Prague",
  GR: "Europe/Athens",
  RO: "Europe/Bucharest",
  ZA: "Africa/Johannesburg",
  NG: "Africa/Lagos",
  KE: "Africa/Nairobi",
  EG: "Africa/Cairo",
  AE: "Asia/Dubai",
  SA: "Asia/Riyadh",
  IL: "Asia/Jerusalem",
  IN: "Asia/Kolkata",
  PK: "Asia/Karachi",
  BD: "Asia/Dhaka",
  SG: "Asia/Singapore",
  MY: "Asia/Kuala_Lumpur",
  ID: "Asia/Jakarta",
  PH: "Asia/Manila",
  TH: "Asia/Bangkok",
  VN: "Asia/Ho_Chi_Minh",
  HK: "Asia/Hong_Kong",
  JP: "Asia/Tokyo",
  KR: "Asia/Seoul",
  CN: "Asia/Shanghai",
  TR: "Europe/Istanbul",
  RU: "Europe/Moscow",
  BR: "America/Sao_Paulo",
  AR: "America/Argentina/Buenos_Aires",
  MX: "America/Mexico_City",
  CL: "America/Santiago",
  CO: "America/Bogota",
  PE: "America/Lima",
};

/**
 * Resolve the IANA timezone to use for a contact's calling-window check
 * from their phone number's country, falling back to `fallbackTz` (the
 * sub-account / agent timezone) when the number can't be parsed or the
 * country isn't in our table.
 */
export function timezoneForPhone(
  phone: string | null | undefined,
  fallbackTz: string,
): string {
  if (!phone) return fallbackTz;
  try {
    const parsed = parsePhoneNumberFromString(phone);
    const code = parsed?.country;
    if (code && COUNTRY_TZ[code]) return COUNTRY_TZ[code];
  } catch {
    // fall through to fallback
  }
  return fallbackTz;
}

/**
 * ISO 3166-1 alpha-2 country code for a phone number, or null when it
 * can't be parsed. Used by the country allow-list compliance check.
 */
export function countryForPhone(
  phone: string | null | undefined,
): string | null {
  if (!phone) return null;
  try {
    return parsePhoneNumberFromString(phone)?.country ?? null;
  } catch {
    return null;
  }
}
