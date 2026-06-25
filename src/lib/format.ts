import type { Timestamp, FieldValue } from "firebase/firestore";

/**
 * Replace local-part + domain-name with bullets, keep the @ and TLD so
 * the field still reads as "an email" during demos / screenshares.
 *   admin@leadstack.com  ->  a••••@l•••••••.com
 *
 * Pure presentation — caller decides when to swap to the real value
 * (typically via a Show/Hide toggle).
 */
export function maskEmail(email: string | null | undefined): string {
  if (!email) return "";
  const at = email.indexOf("@");
  if (at < 1) return "•".repeat(email.length);
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const dot = domain.lastIndexOf(".");
  const maskedLocal = local[0] + "•".repeat(Math.max(local.length - 1, 1));
  if (dot <= 0) return `${maskedLocal}@${"•".repeat(domain.length)}`;
  const domainName = domain.slice(0, dot);
  const tld = domain.slice(dot);
  const maskedDomain =
    domainName[0] + "•".repeat(Math.max(domainName.length - 1, 1));
  return `${maskedLocal}@${maskedDomain}${tld}`;
}

function isTimestamp(v: unknown): v is Timestamp {
  return (
    typeof v === "object" &&
    v !== null &&
    typeof (v as { toDate?: unknown }).toDate === "function"
  );
}

export function toDate(value: Timestamp | FieldValue | Date | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (isTimestamp(value)) return value.toDate();
  return null;
}

export function formatContactDate(
  value: Timestamp | FieldValue | Date | null | undefined,
): string {
  const d = toDate(value);
  if (!d) return "—";
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatRelativeTime(
  value: Timestamp | FieldValue | Date | null | undefined,
): string {
  const d = toDate(value);
  if (!d) return "just now";
  const diffMs = Date.now() - d.getTime();
  const diffSec = Math.round(diffMs / 1000);
  const diffMin = Math.round(diffSec / 60);
  const diffHr = Math.round(diffMin / 60);
  const diffDay = Math.round(diffHr / 24);

  if (diffSec < 30) return "just now";
  if (diffMin < 1) return `${diffSec}s ago`;
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function daysSince(
  value: Timestamp | FieldValue | Date | null | undefined,
): number {
  const d = toDate(value);
  if (!d) return 0;
  const diffMs = Date.now() - d.getTime();
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

export function formatCurrency(value: number, currency = "USD"): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: value % 1 === 0 ? 0 : 2,
    }).format(value || 0);
  } catch {
    return `${currency} ${value.toLocaleString()}`;
  }
}
