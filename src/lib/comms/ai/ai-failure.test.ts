import { describe, expect, it } from "vitest";
import { AiError } from "./openrouter";
import {
  AI_FAILURE_CODES,
  aiFailureMessage,
  aiFailureStatus,
  classifyAiError,
  isRetryable,
  type AiFailure,
} from "./ai-failure";

/**
 * What went wrong, said out loud.
 *
 * The failure that motivated this: AI-assisted setup stopped working and the
 * screen said "the AI that fills the form is not responding right now" — one
 * sentence covering a timeout we had introduced, a wrong key, a spent balance
 * and a provider outage equally. Honest, and completely undiagnosable. The
 * operator retries forever on faults retrying cannot fix, and the real cause
 * lives only in a server log nobody reading the toast can see.
 */

const ALL: AiFailure[] = [
  "timeout",
  "unauthorized",
  "no-credit",
  "rate-limited",
  "rejected",
  "provider-down",
  "unreachable",
  "empty",
  "unknown",
];

describe("telling the failures apart", () => {
  it("recognises our own abort as a timeout", () => {
    // The specific regression: a flat 20s cap was added to a call that had
    // none, and legitimately slow generations started being killed.
    expect(
      classifyAiError(new AiError("did not respond within 20000ms", { timedOut: true }))
    ).toBe("timeout");
  });

  it("maps the statuses that mean different things", () => {
    const cases: [number, AiFailure][] = [
      [401, "unauthorized"],
      [403, "unauthorized"],
      [402, "no-credit"],
      [429, "rate-limited"],
      [400, "rejected"],
      [404, "rejected"],
      [500, "provider-down"],
      [503, "provider-down"],
    ];
    for (const [status, expected] of cases) {
      expect(classifyAiError(new AiError("x", { status })), String(status)).toBe(
        expected
      );
    }
  });

  it("recognises a missing key even though it throws before any request", () => {
    expect(
      classifyAiError(new Error("OPENROUTER_API_KEY is not set — AI replies require it."))
    ).toBe("unauthorized");
  });

  it("recognises a 200 that carried nothing", () => {
    expect(classifyAiError(new AiError("OpenRouter returned no message content"))).toBe(
      "empty"
    );
  });

  it("does not guess when it cannot tell", () => {
    expect(classifyAiError(new Error("something else entirely"))).toBe("unknown");
    expect(classifyAiError("not even an error")).toBe("unknown");
  });
});

describe("what the operator is told", () => {
  it("carries a code on every message, so a screenshot is a diagnosis", () => {
    for (const failure of ALL) {
      const message = aiFailureMessage(failure);
      expect(message, failure).toContain(AI_FAILURE_CODES[failure]);
    }
  });

  it("never leaks the provider, the key, or the balance", () => {
    // An AgentStack customer has no use for any of that, and it is ours.
    for (const failure of ALL) {
      expect(aiFailureMessage(failure), failure).not.toMatch(
        /openrouter|api.?key|anthropic|claude|credit balance|token/i
      );
    }
  });

  it("always leaves a way forward", () => {
    for (const failure of ALL) {
      expect(aiFailureMessage(failure), failure).toMatch(/by hand/i);
    }
  });

  it("does not blame the operator's page for our outage", () => {
    for (const failure of ALL) {
      expect(aiFailureMessage(failure), failure).not.toMatch(
        /could not read|blocks automated|check the address/i
      );
    }
  });

  it("tells them to retry only when retrying could work", () => {
    for (const failure of ALL) {
      const message = aiFailureMessage(failure);
      if (isRetryable(failure)) {
        expect(message, failure).toMatch(/try again|wait a minute/i);
      } else {
        // Telling someone to retry a misconfiguration wastes their afternoon.
        expect(message, failure).not.toMatch(/try again/i);
      }
    }
  });

  it("says plainly when the fault is ours to fix, not theirs", () => {
    for (const failure of ["unauthorized", "no-credit", "rejected"] as const) {
      expect(aiFailureMessage(failure), failure).toMatch(
        /needs attention from us|retrying will not help/i
      );
      expect(aiFailureStatus(failure), failure).toBe(500);
    }
  });

  it("answers 503 for the transient faults", () => {
    for (const failure of ["timeout", "rate-limited", "provider-down"] as const) {
      expect(aiFailureStatus(failure), failure).toBe(503);
    }
  });
});
