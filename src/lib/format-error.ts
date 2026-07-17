/**
 * Best-effort filter between a caught error and a toast/inline message the
 * user actually reads. Most of this codebase's API routes already throw
 * controlled, human-written strings (`throw new Error(payload.error ?? "…")`)
 * — this exists for the handful of routes that forward a third-party API's
 * own error text verbatim (gitpage, Firecrawl) as `error.message`, which
 * occasionally reads as raw/technical rather than something a real estate
 * agent would recognize.
 *
 * Heuristic, not a strict allowlist: trusts anything that reads like a
 * short, plain sentence and only swaps in the fallback when the message
 * looks like a stack trace, a raw object dump, or an SDK/runtime error
 * class name a non-technical user was never meant to see.
 */
const TECHNICAL_PATTERNS = [
  /\bat \S+\s*\(/, // stack trace frames ("at Object.<anonymous> (...")
  /^(Type|Reference|Syntax|Range)Error:/i,
  /\bFirebase(Error)?\b/i,
  /\b(ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT)\b/,
  /^\s*[{[]/, // looks like a dumped object/array rather than a sentence
  /\bundefined is not\b|\bnull is not\b/i,
];

const MAX_LEN = 180;

export function friendlyErrorMessage(err: unknown, fallback: string): string {
  const message = err instanceof Error ? err.message.trim() : "";
  if (!message) return fallback;
  if (message.length > MAX_LEN) return fallback;
  if (TECHNICAL_PATTERNS.some((re) => re.test(message))) return fallback;
  return message;
}
