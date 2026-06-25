import "server-only";

import { parsePhoneNumberFromString } from "libphonenumber-js";

/**
 * Best-effort contact-location resolution for form submissions.
 *
 * Two signals:
 *   - IP geo via ipapi.co (city + lat/lng, free tier 1k/day, no key)
 *   - Phone country-code parsing via libphonenumber-js (country only,
 *     lat/lng resolved to the country centroid below)
 *
 * IP wins when both fire (it gives city-level precision). Phone is the
 * fallback when the request IP is local/loopback/private or ipapi.co
 * fails. Both gracefully degrade to nulls — the contact still creates,
 * the map just doesn't pin them.
 */

export interface ContactLocation {
  countryCode: string | null;
  country: string | null;
  city: string | null;
  lat: number | null;
  lng: number | null;
}

export const EMPTY_LOCATION: ContactLocation = {
  countryCode: null,
  country: null,
  city: null,
  lat: null,
  lng: null,
};

/**
 * Country centroid lookup. ISO 3166-1 alpha-2 → display name + approximate
 * geographic center. Used both for phone-derived locations (pins at the
 * country centroid) and as a name lookup when ipapi.co returns only a code.
 *
 * This list covers the ~140 countries most likely to source leads. If a
 * code is missing, the contact still stores fine — they just won't pin on
 * the map. To expand: append { code: { name, lat, lng } }. Centroids are
 * approximate (visual center, not geographic centroid).
 */
const COUNTRIES: Record<string, { name: string; lat: number; lng: number }> = {
  AE: { name: "United Arab Emirates", lat: 23.42, lng: 53.85 },
  AF: { name: "Afghanistan", lat: 33.94, lng: 67.71 },
  AL: { name: "Albania", lat: 41.15, lng: 20.17 },
  AM: { name: "Armenia", lat: 40.07, lng: 45.04 },
  AO: { name: "Angola", lat: -11.2, lng: 17.87 },
  AR: { name: "Argentina", lat: -38.42, lng: -63.62 },
  AT: { name: "Austria", lat: 47.52, lng: 14.55 },
  AU: { name: "Australia", lat: -25.27, lng: 133.78 },
  AZ: { name: "Azerbaijan", lat: 40.14, lng: 47.58 },
  BA: { name: "Bosnia and Herzegovina", lat: 43.92, lng: 17.68 },
  BD: { name: "Bangladesh", lat: 23.68, lng: 90.36 },
  BE: { name: "Belgium", lat: 50.5, lng: 4.47 },
  BG: { name: "Bulgaria", lat: 42.73, lng: 25.49 },
  BH: { name: "Bahrain", lat: 25.93, lng: 50.64 },
  BO: { name: "Bolivia", lat: -16.29, lng: -63.59 },
  BR: { name: "Brazil", lat: -14.24, lng: -51.93 },
  BY: { name: "Belarus", lat: 53.71, lng: 27.95 },
  CA: { name: "Canada", lat: 56.13, lng: -106.35 },
  CH: { name: "Switzerland", lat: 46.82, lng: 8.23 },
  CI: { name: "Cote d'Ivoire", lat: 7.54, lng: -5.55 },
  CL: { name: "Chile", lat: -35.68, lng: -71.54 },
  CM: { name: "Cameroon", lat: 7.37, lng: 12.35 },
  CN: { name: "China", lat: 35.86, lng: 104.2 },
  CO: { name: "Colombia", lat: 4.57, lng: -74.3 },
  CR: { name: "Costa Rica", lat: 9.75, lng: -83.75 },
  CU: { name: "Cuba", lat: 21.52, lng: -77.78 },
  CY: { name: "Cyprus", lat: 35.13, lng: 33.43 },
  CZ: { name: "Czechia", lat: 49.82, lng: 15.47 },
  DE: { name: "Germany", lat: 51.17, lng: 10.45 },
  DK: { name: "Denmark", lat: 56.26, lng: 9.5 },
  DO: { name: "Dominican Republic", lat: 18.74, lng: -70.16 },
  DZ: { name: "Algeria", lat: 28.03, lng: 1.66 },
  EC: { name: "Ecuador", lat: -1.83, lng: -78.18 },
  EE: { name: "Estonia", lat: 58.6, lng: 25.01 },
  EG: { name: "Egypt", lat: 26.82, lng: 30.8 },
  ES: { name: "Spain", lat: 40.46, lng: -3.75 },
  ET: { name: "Ethiopia", lat: 9.15, lng: 40.49 },
  FI: { name: "Finland", lat: 61.92, lng: 25.75 },
  FR: { name: "France", lat: 46.23, lng: 2.21 },
  GB: { name: "United Kingdom", lat: 55.38, lng: -3.44 },
  GE: { name: "Georgia", lat: 42.32, lng: 43.36 },
  GH: { name: "Ghana", lat: 7.95, lng: -1.02 },
  GR: { name: "Greece", lat: 39.07, lng: 21.82 },
  GT: { name: "Guatemala", lat: 15.78, lng: -90.23 },
  HK: { name: "Hong Kong", lat: 22.4, lng: 114.11 },
  HN: { name: "Honduras", lat: 15.2, lng: -86.24 },
  HR: { name: "Croatia", lat: 45.1, lng: 15.2 },
  HU: { name: "Hungary", lat: 47.16, lng: 19.5 },
  ID: { name: "Indonesia", lat: -0.79, lng: 113.92 },
  IE: { name: "Ireland", lat: 53.41, lng: -8.24 },
  IL: { name: "Israel", lat: 31.05, lng: 34.85 },
  IN: { name: "India", lat: 20.59, lng: 78.96 },
  IQ: { name: "Iraq", lat: 33.22, lng: 43.68 },
  IR: { name: "Iran", lat: 32.43, lng: 53.69 },
  IS: { name: "Iceland", lat: 64.96, lng: -19.02 },
  IT: { name: "Italy", lat: 41.87, lng: 12.57 },
  JM: { name: "Jamaica", lat: 18.11, lng: -77.3 },
  JO: { name: "Jordan", lat: 30.59, lng: 36.24 },
  JP: { name: "Japan", lat: 36.2, lng: 138.25 },
  KE: { name: "Kenya", lat: -0.02, lng: 37.91 },
  KH: { name: "Cambodia", lat: 12.57, lng: 104.99 },
  KR: { name: "South Korea", lat: 35.91, lng: 127.77 },
  KW: { name: "Kuwait", lat: 29.31, lng: 47.48 },
  KZ: { name: "Kazakhstan", lat: 48.02, lng: 66.92 },
  LA: { name: "Laos", lat: 19.86, lng: 102.5 },
  LB: { name: "Lebanon", lat: 33.85, lng: 35.86 },
  LK: { name: "Sri Lanka", lat: 7.87, lng: 80.77 },
  LT: { name: "Lithuania", lat: 55.17, lng: 23.88 },
  LU: { name: "Luxembourg", lat: 49.82, lng: 6.13 },
  LV: { name: "Latvia", lat: 56.88, lng: 24.6 },
  MA: { name: "Morocco", lat: 31.79, lng: -7.09 },
  MC: { name: "Monaco", lat: 43.75, lng: 7.41 },
  MD: { name: "Moldova", lat: 47.41, lng: 28.37 },
  ME: { name: "Montenegro", lat: 42.71, lng: 19.37 },
  MK: { name: "North Macedonia", lat: 41.61, lng: 21.74 },
  MM: { name: "Myanmar", lat: 21.91, lng: 95.96 },
  MN: { name: "Mongolia", lat: 46.86, lng: 103.85 },
  MT: { name: "Malta", lat: 35.94, lng: 14.38 },
  MU: { name: "Mauritius", lat: -20.35, lng: 57.55 },
  MV: { name: "Maldives", lat: 3.2, lng: 73.22 },
  MX: { name: "Mexico", lat: 23.63, lng: -102.55 },
  MY: { name: "Malaysia", lat: 4.21, lng: 101.98 },
  MZ: { name: "Mozambique", lat: -18.67, lng: 35.53 },
  NA: { name: "Namibia", lat: -22.96, lng: 18.49 },
  NG: { name: "Nigeria", lat: 9.08, lng: 8.68 },
  NI: { name: "Nicaragua", lat: 12.87, lng: -85.21 },
  NL: { name: "Netherlands", lat: 52.13, lng: 5.29 },
  NO: { name: "Norway", lat: 60.47, lng: 8.47 },
  NP: { name: "Nepal", lat: 28.39, lng: 84.12 },
  NZ: { name: "New Zealand", lat: -40.9, lng: 174.89 },
  OM: { name: "Oman", lat: 21.51, lng: 55.92 },
  PA: { name: "Panama", lat: 8.54, lng: -80.78 },
  PE: { name: "Peru", lat: -9.19, lng: -75.02 },
  PH: { name: "Philippines", lat: 12.88, lng: 121.77 },
  PK: { name: "Pakistan", lat: 30.38, lng: 69.35 },
  PL: { name: "Poland", lat: 51.92, lng: 19.15 },
  PR: { name: "Puerto Rico", lat: 18.22, lng: -66.59 },
  PT: { name: "Portugal", lat: 39.4, lng: -8.22 },
  PY: { name: "Paraguay", lat: -23.44, lng: -58.44 },
  QA: { name: "Qatar", lat: 25.35, lng: 51.18 },
  RO: { name: "Romania", lat: 45.94, lng: 24.97 },
  RS: { name: "Serbia", lat: 44.02, lng: 21.01 },
  RU: { name: "Russia", lat: 61.52, lng: 105.32 },
  RW: { name: "Rwanda", lat: -1.94, lng: 29.87 },
  SA: { name: "Saudi Arabia", lat: 23.89, lng: 45.08 },
  SE: { name: "Sweden", lat: 60.13, lng: 18.64 },
  SG: { name: "Singapore", lat: 1.35, lng: 103.82 },
  SI: { name: "Slovenia", lat: 46.15, lng: 14.99 },
  SK: { name: "Slovakia", lat: 48.67, lng: 19.7 },
  SN: { name: "Senegal", lat: 14.5, lng: -14.45 },
  SV: { name: "El Salvador", lat: 13.79, lng: -88.9 },
  TH: { name: "Thailand", lat: 15.87, lng: 100.99 },
  TN: { name: "Tunisia", lat: 33.89, lng: 9.54 },
  TR: { name: "Turkey", lat: 38.96, lng: 35.24 },
  TW: { name: "Taiwan", lat: 23.7, lng: 120.96 },
  TZ: { name: "Tanzania", lat: -6.37, lng: 34.89 },
  UA: { name: "Ukraine", lat: 48.38, lng: 31.17 },
  UG: { name: "Uganda", lat: 1.37, lng: 32.29 },
  US: { name: "United States", lat: 39.83, lng: -98.58 },
  UY: { name: "Uruguay", lat: -32.52, lng: -55.77 },
  UZ: { name: "Uzbekistan", lat: 41.38, lng: 64.59 },
  VE: { name: "Venezuela", lat: 6.42, lng: -66.59 },
  VN: { name: "Vietnam", lat: 14.06, lng: 108.28 },
  YE: { name: "Yemen", lat: 15.55, lng: 48.52 },
  ZA: { name: "South Africa", lat: -30.56, lng: 22.94 },
  ZM: { name: "Zambia", lat: -13.13, lng: 27.85 },
  ZW: { name: "Zimbabwe", lat: -19.02, lng: 29.15 },
};

/**
 * Resolve a contact location from a phone number's country code.
 * Returns EMPTY_LOCATION if the phone can't be parsed, has no country,
 * or the country isn't in our centroid table.
 */
export function locationFromPhone(
  phone: string | null | undefined,
): ContactLocation {
  if (!phone) return EMPTY_LOCATION;
  try {
    const parsed = parsePhoneNumberFromString(phone);
    const code = parsed?.country;
    if (!code) return EMPTY_LOCATION;
    const entry = COUNTRIES[code];
    if (!entry) {
      // Code recognized but not in our table — store the code so we at
      // least know roughly where they're from, even without a pin.
      return {
        countryCode: code,
        country: null,
        city: null,
        lat: null,
        lng: null,
      };
    }
    return {
      countryCode: code,
      country: entry.name,
      city: null,
      lat: entry.lat,
      lng: entry.lng,
    };
  } catch {
    return EMPTY_LOCATION;
  }
}

/**
 * Resolve a contact location from an IP via ipapi.co. Returns
 * EMPTY_LOCATION for local/loopback IPs and on any error (timeout,
 * non-2xx, rate limit, malformed response). Caller should fall back to
 * locationFromPhone() when this returns no usable signal.
 */
export async function locationFromIp(
  ip: string | null | undefined,
): Promise<ContactLocation> {
  if (!ip) return EMPTY_LOCATION;
  if (
    ip === "127.0.0.1" ||
    ip === "::1" ||
    ip.startsWith("10.") ||
    ip.startsWith("192.168.") ||
    ip.startsWith("172.")
  ) {
    return EMPTY_LOCATION;
  }
  try {
    const res = await fetch(`https://ipapi.co/${encodeURIComponent(ip)}/json/`, {
      signal: AbortSignal.timeout(3000),
      headers: { "User-Agent": "leadstack-form-submit" },
    });
    if (!res.ok) return EMPTY_LOCATION;
    const data = (await res.json()) as {
      error?: boolean;
      country_code?: string;
      country_name?: string;
      city?: string;
      latitude?: number;
      longitude?: number;
    };
    if (data.error) return EMPTY_LOCATION;
    return {
      countryCode: data.country_code ?? null,
      country: data.country_name ?? null,
      city: data.city ?? null,
      lat: typeof data.latitude === "number" ? data.latitude : null,
      lng: typeof data.longitude === "number" ? data.longitude : null,
    };
  } catch {
    return EMPTY_LOCATION;
  }
}

/**
 * Merge two locations field-by-field — primary wins where it has a value,
 * fallback fills the rest. Use this to combine IP-derived (more precise)
 * with phone-derived (country-only) results.
 */
export function mergeLocation(
  primary: ContactLocation,
  fallback: ContactLocation,
): ContactLocation {
  return {
    countryCode: primary.countryCode ?? fallback.countryCode,
    country: primary.country ?? fallback.country,
    city: primary.city ?? fallback.city,
    lat: primary.lat ?? fallback.lat,
    lng: primary.lng ?? fallback.lng,
  };
}

/**
 * Extract the request client's IP from the standard proxy headers Vercel
 * and most hosts forward. Returns null when not present (rare in prod,
 * common in local dev).
 */
export function ipFromRequest(request: Request): string | null {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    // First IP in the comma-separated list is the original client.
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip");
}
