"use client";

import { useMemo } from "react";

/**
 * Native <select> of curated key-city timezones, grouped by region. Stores
 * the canonical IANA name (e.g. "Australia/Sydney") as the value; displays
 * "City (GMT±N)" so operators can pick by offset without scrolling 400 zones.
 *
 * Offsets are computed live at render time via Intl.DateTimeFormat with
 * timeZoneName: "longOffset", so DST shifts and half-hour zones (Adelaide,
 * Mumbai, Tehran) render correctly without hard-coding.
 *
 * If the bound `value` isn't in the curated list (e.g. an existing doc
 * carries "Europe/Copenhagen"), it's preserved in an "Other" group so we
 * never silently mutate stored data.
 */

interface TimezoneSelectProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
  disabled?: boolean;
}

interface CuratedCity {
  /** Canonical IANA timezone — what gets persisted. */
  value: string;
  /** Display name shown in the dropdown. */
  label: string;
  /** Region grouping for the optgroup. */
  region: string;
}

// Roughly ordered west-to-east within each region so the dropdown reads as a
// time-of-day sweep rather than alphabet soup.
const KEY_CITIES: CuratedCity[] = [
  // Americas
  { value: "Pacific/Honolulu", label: "Honolulu", region: "Americas" },
  { value: "America/Anchorage", label: "Anchorage", region: "Americas" },
  { value: "America/Los_Angeles", label: "Los Angeles", region: "Americas" },
  { value: "America/Denver", label: "Denver", region: "Americas" },
  { value: "America/Phoenix", label: "Phoenix", region: "Americas" },
  { value: "America/Chicago", label: "Chicago", region: "Americas" },
  { value: "America/Mexico_City", label: "Mexico City", region: "Americas" },
  { value: "America/New_York", label: "New York", region: "Americas" },
  { value: "America/Toronto", label: "Toronto", region: "Americas" },
  { value: "America/Halifax", label: "Halifax", region: "Americas" },
  { value: "America/Sao_Paulo", label: "São Paulo", region: "Americas" },
  { value: "America/Argentina/Buenos_Aires", label: "Buenos Aires", region: "Americas" },

  // Europe & Africa
  { value: "Atlantic/Azores", label: "Azores", region: "Europe & Africa" },
  { value: "Europe/Lisbon", label: "Lisbon", region: "Europe & Africa" },
  { value: "Europe/London", label: "London", region: "Europe & Africa" },
  { value: "Europe/Dublin", label: "Dublin", region: "Europe & Africa" },
  { value: "Africa/Lagos", label: "Lagos", region: "Europe & Africa" },
  { value: "Europe/Madrid", label: "Madrid", region: "Europe & Africa" },
  { value: "Europe/Paris", label: "Paris", region: "Europe & Africa" },
  { value: "Europe/Amsterdam", label: "Amsterdam", region: "Europe & Africa" },
  { value: "Europe/Berlin", label: "Berlin", region: "Europe & Africa" },
  { value: "Europe/Rome", label: "Rome", region: "Europe & Africa" },
  { value: "Europe/Stockholm", label: "Stockholm", region: "Europe & Africa" },
  { value: "Africa/Cairo", label: "Cairo", region: "Europe & Africa" },
  { value: "Africa/Johannesburg", label: "Johannesburg", region: "Europe & Africa" },
  { value: "Europe/Athens", label: "Athens", region: "Europe & Africa" },
  { value: "Europe/Helsinki", label: "Helsinki", region: "Europe & Africa" },
  { value: "Europe/Istanbul", label: "Istanbul", region: "Europe & Africa" },
  { value: "Europe/Moscow", label: "Moscow", region: "Europe & Africa" },

  // Middle East & Asia
  { value: "Asia/Tehran", label: "Tehran", region: "Middle East & Asia" },
  { value: "Asia/Dubai", label: "Dubai", region: "Middle East & Asia" },
  { value: "Asia/Karachi", label: "Karachi", region: "Middle East & Asia" },
  { value: "Asia/Kolkata", label: "Mumbai / Kolkata", region: "Middle East & Asia" },
  { value: "Asia/Dhaka", label: "Dhaka", region: "Middle East & Asia" },
  { value: "Asia/Bangkok", label: "Bangkok", region: "Middle East & Asia" },
  { value: "Asia/Jakarta", label: "Jakarta", region: "Middle East & Asia" },
  { value: "Asia/Singapore", label: "Singapore", region: "Middle East & Asia" },
  { value: "Asia/Hong_Kong", label: "Hong Kong", region: "Middle East & Asia" },
  { value: "Asia/Shanghai", label: "Shanghai", region: "Middle East & Asia" },
  { value: "Asia/Tokyo", label: "Tokyo", region: "Middle East & Asia" },
  { value: "Asia/Seoul", label: "Seoul", region: "Middle East & Asia" },

  // Pacific
  { value: "Australia/Perth", label: "Perth", region: "Pacific" },
  { value: "Australia/Adelaide", label: "Adelaide", region: "Pacific" },
  { value: "Australia/Brisbane", label: "Brisbane", region: "Pacific" },
  { value: "Australia/Sydney", label: "Sydney", region: "Pacific" },
  { value: "Australia/Melbourne", label: "Melbourne", region: "Pacific" },
  { value: "Pacific/Auckland", label: "Auckland", region: "Pacific" },
];

const REGION_ORDER = [
  "UTC",
  "Americas",
  "Europe & Africa",
  "Middle East & Asia",
  "Pacific",
  "Other",
];

/**
 * Returns the GMT offset for an IANA zone, formatted "GMT", "GMT+10", or
 * "GMT+5:30". Empty string on failure (so the option still renders without
 * the offset suffix rather than crashing the form).
 */
function gmtOffset(zone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      timeZoneName: "longOffset",
    }).formatToParts(new Date());
    const raw = parts.find((p) => p.type === "timeZoneName")?.value ?? "";
    if (!raw || raw === "GMT") return "GMT";
    // Browsers return "GMT+10:00" / "GMT-3:30" / "GMT+05:45" — strip the
    // ":00" suffix on whole-hour offsets and trim leading zeros so it reads
    // like "GMT+10" / "GMT-3:30" / "GMT+5:45".
    return raw
      .replace(/GMT([+-])0?(\d+)(:\d{2})?/, (_m, sign, hours, mins) =>
        mins && mins !== ":00" ? `GMT${sign}${hours}${mins}` : `GMT${sign}${hours}`,
      );
  } catch {
    return "";
  }
}

interface ZoneOption {
  value: string;
  label: string;
}

interface ZoneGroup {
  region: string;
  zones: ZoneOption[];
}

function buildGroups(currentValue: string): ZoneGroup[] {
  const groups = new Map<string, ZoneOption[]>([["UTC", []]]);
  groups.get("UTC")!.push({ value: "UTC", label: `UTC (${gmtOffset("UTC")})` });

  for (const city of KEY_CITIES) {
    const offset = gmtOffset(city.value);
    const label = offset ? `${city.label} (${offset})` : city.label;
    const list = groups.get(city.region) ?? [];
    list.push({ value: city.value, label });
    groups.set(city.region, list);
  }

  // Preserve any pre-existing value that isn't curated (e.g. a sub-account
  // doc that was created with "Europe/Copenhagen"). It surfaces as an
  // "Other" entry so the user sees what's stored and can switch to a
  // curated city if they want.
  const isCurated =
    currentValue === "UTC" ||
    KEY_CITIES.some((c) => c.value === currentValue);
  if (currentValue && !isCurated) {
    const offset = gmtOffset(currentValue);
    const label = offset ? `${currentValue} (${offset})` : currentValue;
    groups.set("Other", [{ value: currentValue, label }]);
  }

  return REGION_ORDER.filter((r) => groups.has(r) && groups.get(r)!.length > 0).map(
    (region) => ({ region, zones: groups.get(region) ?? [] }),
  );
}

export function TimezoneSelect({
  id,
  value,
  onChange,
  className,
  disabled,
}: TimezoneSelectProps) {
  const groups = useMemo(() => buildGroups(value), [value]);
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className={
        className ??
        "h-9 w-full rounded-md border border-input bg-background px-3 text-sm disabled:cursor-not-allowed disabled:opacity-60"
      }
    >
      {groups.map((g) => (
        <optgroup key={g.region} label={g.region}>
          {g.zones.map((z) => (
            <option key={z.value} value={z.value}>
              {z.label}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
