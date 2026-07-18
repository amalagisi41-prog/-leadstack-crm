import type { SendWindow } from "@/types/tenancy";
import type { WorkflowNodeType } from "@/types/workflows";

/**
 * Pure send-window math for the Workflows v2 engine. No I/O — kept separate
 * from `engine.ts` so the quiet-hours logic can be unit-tested directly,
 * mirroring `time-trigger-dates.ts`'s split.
 *
 * The v1 automations engine (documented in CLAUDE.md, since removed from the
 * codebase) deferred a step "outside the window" rather than skipping or
 * force-sending it — same behavior here: a gated node reschedules itself for
 * the next window open rather than firing at 2am or getting dropped.
 */

/** Node types that reach a contact directly and are therefore subject to the
 *  sub-account's configured quiet hours. Internal-only actions (webhook,
 *  notify, tagging, etc.) are never gated — quiet hours protect contacts,
 *  not operators. */
const SEND_GATED_NODE_TYPES: ReadonlySet<WorkflowNodeType> = new Set([
  "send_sms",
  "send_email",
  "whatsapp_template",
  "google_review_request",
]);

export function isSendGatedNodeType(type: WorkflowNodeType): boolean {
  return SEND_GATED_NODE_TYPES.has(type);
}

/**
 * Seconds to wait before the next allowed send, or 0 if `now` already falls
 * inside `sendWindow`. A missing/null window (never configured) or a
 * malformed one (bad hours, unrecognized timezone) fails OPEN — always 0 —
 * so a config problem can never silently strand every workflow in an
 * infinite defer loop.
 */
export function secondsUntilSendWindow(
  sendWindow: SendWindow | null | undefined,
  now: Date = new Date(),
): number {
  if (!sendWindow) return 0;
  const { startHour, endHour, timezone } = sendWindow;
  if (
    !Number.isFinite(startHour) ||
    !Number.isFinite(endHour) ||
    startHour < 0 ||
    startHour > 23 ||
    endHour < 1 ||
    endHour > 24 ||
    startHour >= endHour
  ) {
    return 0;
  }

  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone || "UTC",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
      hourCycle: "h23",
    }).formatToParts(now);
  } catch {
    return 0;
  }

  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");
  const hour = get("hour") % 24;
  const minute = get("minute");
  const second = get("second");

  if (hour >= startHour && hour < endHour) return 0;

  const secondsSinceMidnight = hour * 3600 + minute * 60 + second;
  const windowStartSeconds = startHour * 3600;
  let deferSeconds = windowStartSeconds - secondsSinceMidnight;
  if (deferSeconds <= 0) deferSeconds += 24 * 3600;
  return deferSeconds;
}
