import { describe, expect, it } from "vitest";
import {
  CLARIFY_POLICY_PROMPT,
  MAX_QUESTIONS_PER_TASK,
  decideClarification,
} from "./clarify";

/**
 * The two ways "asks the right questions" goes wrong.
 *
 * Asking too little: Zack guesses, acts, and the operator finds out later.
 * Asking too much: Zack becomes a form, and the agent who said "help me follow
 * up with my leads" gets four questions back — handed the work they came here
 * to avoid. The second is the likelier failure, because asking feels safe to a
 * model, so the budget is deliberately tight and most of these tests defend it.
 */

const base = {
  questionsAskedSoFar: 0,
  answerChangesOutput: true,
  hasSafeDefault: false,
  irreversible: false,
};

describe("when nothing material is unknown", () => {
  it("just does the work", () => {
    expect(
      decideClarification({ ...base, answerChangesOutput: false })
    ).toEqual({ action: "proceed" });
  });

  it("does the work even with questions already spent", () => {
    expect(
      decideClarification({
        ...base,
        answerChangesOutput: false,
        questionsAskedSoFar: 5,
      })
    ).toEqual({ action: "proceed" });
  });
});

describe("when a sensible default exists", () => {
  it("takes the default rather than asking", () => {
    const decision = decideClarification({ ...base, hasSafeDefault: true });
    expect(decision.action).toBe("assume");
  });

  it("requires the assumption to be said out loud", () => {
    // Proceeding silently on a guess is the failure this module exists to
    // prevent. The operator must be able to correct it in one word.
    const decision = decideClarification({ ...base, hasSafeDefault: true });
    expect(decision).toEqual({ action: "assume", requiresStatedAssumption: true });
  });
});

describe("the question budget", () => {
  it("asks when something material is unknown and there is no default", () => {
    expect(decideClarification(base)).toEqual({ action: "ask" });
  });

  it("stops asking once the budget is spent and commits instead", () => {
    const decision = decideClarification({
      ...base,
      questionsAskedSoFar: MAX_QUESTIONS_PER_TASK,
    });
    expect(decision).toEqual({ action: "assume", requiresStatedAssumption: true });
  });

  it("never runs past the budget however long the task drags", () => {
    for (const asked of [2, 3, 10]) {
      expect(
        decideClarification({ ...base, questionsAskedSoFar: asked }).action,
        `after ${asked}`
      ).not.toBe("ask");
    }
  });
});

describe("things the operator cannot take back", () => {
  it("always confirms, even with the budget spent", () => {
    // The budget exists to stop Zack being tedious, not to let it send a
    // guess to somebody's client.
    expect(
      decideClarification({
        ...base,
        irreversible: true,
        questionsAskedSoFar: 99,
        hasSafeDefault: true,
      })
    ).toEqual({ action: "ask" });
  });

  it("does not invent a confirmation when nothing is actually unknown", () => {
    expect(
      decideClarification({
        ...base,
        irreversible: true,
        answerChangesOutput: false,
      })
    ).toEqual({ action: "proceed" });
  });
});

describe("the policy handed to the model", () => {
  it("states the limit as behaviour rather than principle", () => {
    // "Be concise" is ignored by every model; "one question, then act" is not.
    expect(CLARIFY_POLICY_PROMPT).toMatch(/at most ONE question per reply/);
    expect(CLARIFY_POLICY_PROMPT).toMatch(/never ask more than two questions/i);
  });

  it("forbids asking for what is already on screen", () => {
    expect(CLARIFY_POLICY_PROMPT).toMatch(/Never ask for something already visible/i);
    expect(CLARIFY_POLICY_PROMPT).toMatch(/Business Blueprint/);
  });

  it("carries the irreversible-action exception", () => {
    // Whitespace-tolerant: the policy is a wrapped template literal, so the
    // phrase spans a line break.
    expect(CLARIFY_POLICY_PROMPT).toMatch(
      /sends a message to a client,\s+publishes to the\s+public,\s+or spends\s+money/
    );
  });
});
