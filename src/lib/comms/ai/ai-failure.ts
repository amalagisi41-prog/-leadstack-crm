import { AiError } from "./openrouter";

/**
 * Naming why a completion failed, so the operator is told something true and
 * we can tell from a screenshot what happened.
 *
 * The failure that motivated this: AI-assisted setup stopped working, the
 * screen said "the AI that fills the form is not responding right now", and
 * that one sentence covered a timeout we had introduced, a wrong API key, an
 * exhausted balance and a provider outage equally well. It was honest and
 * completely undiagnosable — the operator retries forever on a fault that
 * retrying cannot fix, and the only record of the real cause is a server log
 * nobody reading the toast can see.
 *
 * So each kind gets its own sentence and its own short code. The code is not
 * decoration: it is how a support screenshot becomes a diagnosis. It carries
 * no secret — a category name, nothing about the key or the account.
 */

export type AiFailure =
  | "timeout" // ours: the model did not finish inside the budget
  | "unauthorized" // the key is missing, wrong, or revoked
  | "no-credit" // the account balance is spent
  | "rate-limited" // too many requests, or the model is saturated
  | "rejected" // the request itself was refused (bad model, bad params)
  | "provider-down" // OpenRouter or the upstream model is failing
  | "unreachable" // never got there — DNS, TLS, socket
  | "empty" // a 200 carrying no content
  | "unknown";

export function classifyAiError(error: unknown): AiFailure {
  if (!(error instanceof AiError)) {
    // Includes the "OPENROUTER_API_KEY is not set" throw, which is a plain
    // Error raised before any request is attempted.
    if (error instanceof Error && /OPENROUTER_API_KEY/i.test(error.message)) {
      return "unauthorized";
    }
    return "unknown";
  }

  if (error.timedOut) return "timeout";

  const status = error.status;
  if (status === undefined) {
    if (/no message content/i.test(error.message)) return "empty";
    if (/request failed/i.test(error.message)) return "unreachable";
    return "unknown";
  }
  if (status === 401 || status === 403) return "unauthorized";
  if (status === 402) return "no-credit";
  if (status === 429) return "rate-limited";
  if (status >= 500) return "provider-down";
  if (status >= 400) return "rejected";
  return "unknown";
}

/** Short, non-secret marker so a screenshot identifies the cause. */
export const AI_FAILURE_CODES: Record<AiFailure, string> = {
  timeout: "AI-TIMEOUT",
  unauthorized: "AI-AUTH",
  "no-credit": "AI-CREDIT",
  "rate-limited": "AI-BUSY",
  rejected: "AI-REQUEST",
  "provider-down": "AI-PROVIDER",
  unreachable: "AI-NETWORK",
  empty: "AI-EMPTY",
  unknown: "AI-UNKNOWN",
};

/** Whether trying the same thing again could plausibly work. */
export function isRetryable(failure: AiFailure): boolean {
  return (
    failure === "timeout" ||
    failure === "rate-limited" ||
    failure === "provider-down" ||
    failure === "unreachable" ||
    failure === "empty" ||
    // Not knowing is not the same as knowing it is permanent. Offer the
    // retry; the codes above cover the cases where retrying is futile.
    failure === "unknown"
  );
}

const BY_HAND =
  "You can fill the form in by hand below in the meantime — every field is editable.";

/**
 * What to show the operator. Never names the provider, the key, or the
 * balance; a customer of AgentStack has no use for any of that. But it does
 * distinguish "wait and retry" from "this will not fix itself", because
 * telling someone to retry a misconfiguration wastes their afternoon.
 */
export function aiFailureMessage(failure: AiFailure): string {
  const code = AI_FAILURE_CODES[failure];
  switch (failure) {
    case "timeout":
      return `We read your page, but filling the form took longer than we allow and was stopped. Try again — it usually goes through on a second run, and a shorter page is faster. ${BY_HAND} (${code})`;
    case "rate-limited":
      return `We read your page, but our AI is handling too many requests right now. Wait a minute and try again. ${BY_HAND} (${code})`;
    case "provider-down":
    case "unreachable":
      return `We read your page, but the AI service is unavailable at the moment. This is on our side and not something you can fix. Try again shortly. ${BY_HAND} (${code})`;
    case "empty":
      return `We read your page, but the AI came back with nothing to fill in. Try again, or use a page with more detail on it. ${BY_HAND} (${code})`;
    case "unauthorized":
    case "no-credit":
    case "rejected":
      // Deliberately does not say "try again": nothing the operator does will
      // change the outcome until someone fixes the configuration.
      return `AI-assisted setup is not available on this workspace right now — it needs attention from us, and retrying will not help. Please fill your Blueprint in by hand below, and let support know you saw code ${code}.`;
    case "unknown":
      return `We read your page, but could not finish filling the form. Try again. ${BY_HAND} (${code})`;
  }
}

/** HTTP status for the route to answer with. */
export function aiFailureStatus(failure: AiFailure): number {
  return isRetryable(failure) ? 503 : 500;
}
