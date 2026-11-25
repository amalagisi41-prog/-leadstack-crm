import type { ReviewRequestStatus } from "@/types/review-requests";

/**
 * Plain-language text for every outcome the review dispatcher can return, so
 * no request ever fails without saying why. Client-safe.
 */
const REASON_TEXT: Record<string, string> = {
  not_configured: "the Google review link isn't set up yet (Workspace Settings → Google reviews)",
  trigger_disabled: "this automatic trigger is turned off",
  no_contact: "the contact no longer exists",
  no_phone: "the contact has no phone number",
  opted_out: "the contact has opted out of messages on this channel",
  cooldown: "the contact was already asked for a review recently",
  sms_not_configured: "text messaging isn't configured for this workspace",
  whatsapp_gate_off: "WhatsApp isn't enabled for this workspace",
  whatsapp_not_configured: "no WhatsApp sender is configured",
  window_closed: "the WhatsApp 24-hour reply window is closed",
  no_template: "no approved WhatsApp review template is selected",
  template_not_approved: "the WhatsApp review template isn't approved",
  template_var_missing: "the WhatsApp template is missing a value for this contact",
  send_failed: "the message provider rejected the send",
  scheduling_unavailable: "delayed sending isn't available on this deployment, so it couldn't be scheduled",
  automation_off: "the review automation was turned off before the send time",
  log_only: "log-only mode — nothing is sent",
  error: "an unexpected error occurred",
};

export function reviewReasonText(reason: string | null | undefined, detail?: string): string {
  if (!reason) return "";
  const base = REASON_TEXT[reason] ?? reason.replace(/_/g, " ");
  return detail ? `${base} (${detail})` : base;
}

/** Contact-level reasons are "skipped"; everything else that didn't send is "failed". */
const SKIP_REASONS = new Set(["opted_out", "cooldown", "no_phone", "no_contact", "trigger_disabled"]);

export function statusForOutcome(outcome: {
  sent: boolean;
  reason?: string;
  wouldSend?: boolean;
}): ReviewRequestStatus {
  if (outcome.sent) return "sent";
  if (outcome.wouldSend) return "would_send";
  return outcome.reason && SKIP_REASONS.has(outcome.reason) ? "skipped" : "failed";
}

export const STATUS_LABEL: Record<ReviewRequestStatus, string> = {
  queued: "Queued",
  would_send: "Would send (log only)",
  sent: "Sent",
  failed: "Failed",
  skipped: "Skipped",
  cancelled: "Cancelled",
};
