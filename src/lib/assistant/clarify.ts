/**
 * When Zack asks a question instead of doing the work.
 *
 * Both failure directions are real and this codebase has seen the second one.
 *
 * Ask too little and Zack guesses, acts on the guess, and the operator finds
 * out later — the expensive version of a dead end because work was done wrong
 * rather than not done.
 *
 * Ask too much and Zack becomes a form. A new agent who says "help me follow
 * up with my leads" and is asked four questions about channel, cadence,
 * segment, and tone has been handed the work they came here to avoid. That is
 * the "convoluted" failure, and it is the more common one, because asking
 * feels safe to a model.
 *
 * The policy: at most one question per turn, and only when the answer changes
 * what gets built. Everything else is decided from what is already known and
 * stated as an assumption the operator can correct in a word.
 */

export const MAX_QUESTIONS_PER_TURN = 1;

/** Total questions before Zack must act on assumptions instead. */
export const MAX_QUESTIONS_PER_TASK = 2;

export interface ClarifyInput {
  /** Questions Zack has already asked while working on this request. */
  questionsAskedSoFar: number;
  /**
   * True when the missing answer changes the output materially — not merely
   * when it would be nice to know.
   */
  answerChangesOutput: boolean;
  /** True when a sensible default exists and can be stated out loud. */
  hasSafeDefault: boolean;
  /**
   * True when acting on a guess could send something to a client, publish
   * something, or spend money. These never proceed on an assumption.
   */
  irreversible: boolean;
}

export type ClarifyDecision =
  | { action: "ask" }
  | { action: "assume"; requiresStatedAssumption: true }
  | { action: "proceed" };

export function decideClarification(input: ClarifyInput): ClarifyDecision {
  const {
    questionsAskedSoFar,
    answerChangesOutput,
    hasSafeDefault,
    irreversible,
  } = input;

  // Nothing material is unknown — asking anything now is stalling.
  if (!answerChangesOutput) return { action: "proceed" };

  // Anything the operator cannot take back gets a question however many have
  // already been asked. The budget exists to stop Zack being tedious, not to
  // let it send a guess to somebody's client.
  if (irreversible) return { action: "ask" };

  if (questionsAskedSoFar >= MAX_QUESTIONS_PER_TASK) {
    // Out of budget. Proceeding silently on a guess is the failure this whole
    // module exists to prevent, so the assumption has to be visible.
    return { action: "assume", requiresStatedAssumption: true };
  }

  if (hasSafeDefault) return { action: "assume", requiresStatedAssumption: true };

  return { action: "ask" };
}

/**
 * The rule text handed to the model.
 *
 * Written as behaviour rather than principle. "Be concise" is ignored by every
 * model; "one question, then act" is followed.
 */
export const CLARIFY_POLICY_PROMPT = `## Asking questions

- Ask at most ONE question per reply, and only when the answer changes what you
  would build. If you can pick a sensible default, pick it and say which one in
  a single short sentence the operator can correct.
- Never ask more than two questions across a whole task. After that, choose,
  state the choice, and do the work.
- Never ask for something already visible: their name, brokerage, service
  areas, connected channels, or anything in the Business Blueprint or on the
  current screen.
- Never ask an open question where a choice will do. "Which of these two?"
  beats "tell me about your goals."
- One exception: anything that sends a message to a client, publishes to the
  public, or spends money always gets confirmed first, no matter how many
  questions have already been asked.`;
