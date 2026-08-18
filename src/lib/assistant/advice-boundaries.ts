/**
 * The questions Zack must not answer, detected before the model runs.
 *
 * A prompt instruction is not a control. The same reasoning already applies to
 * published website copy in `website-studio/content-compliance.ts`: an
 * instruction in a system prompt is advice to the model, and one unlucky
 * generation puts it on the record. These are the topics where a confident,
 * plausible, wrong answer costs the operator their licence or their client's
 * money, so the boundary is enforced in code and the model never gets the
 * chance.
 *
 * The distinction that matters is between *operating* and *advising*. "How do
 * I log a commission in AgentStack" is product help. "What commission split
 * should I agree to" is a business-terms question Zack has no standing to
 * answer. Only the second is refused, and the refusal always routes somewhere
 * — a decline with no next step is the dead end this product does not permit.
 */

export type AdviceBoundary =
  | "legal"
  | "tax"
  | "valuation"
  | "lending"
  | "fair-housing-screening";

export interface BoundaryHit {
  boundary: AdviceBoundary;
  /** What Zack says instead — short, specific, and pointing somewhere. */
  response: string;
  /** The professional this belongs to. */
  referTo: string;
}

interface BoundaryRule {
  boundary: AdviceBoundary;
  /** Phrases that indicate the operator is asking for a professional opinion. */
  patterns: RegExp[];
  response: string;
  referTo: string;
}

/**
 * Deliberately narrow. Broad matching would refuse ordinary product questions
 * — "where do I upload a contract" contains "contract" — and an assistant that
 * refuses routine work is worse than no assistant. Each pattern targets a
 * request for an opinion or an interpretation, not a mention of the subject.
 */
const RULES: BoundaryRule[] = [
  {
    boundary: "legal",
    patterns: [
      /\b(is|are|would|could)\s+(it|this|that|they|i|we)\s+(be\s+)?(legally|legal|liable|enforceable)\b/i,
      /\bcan i (legally|be sued|get sued|be held liable)\b/i,
      /\b(interpret|review|explain what.{0,20}\bclause\b|does this clause)\b/i,
      /\b(draft|write|create)\s+(me\s+)?(a|an|the)\s+(contract|addendum|lease|purchase agreement|disclosure form)\b/i,
      /\bwhat are my legal (rights|obligations|options)\b/i,
      /\bdo i have to disclose\b/i,
    ],
    response:
      "That is a legal question about your obligations, and getting it wrong is expensive — I am not able to answer it. Your broker is the fastest first call, and your brokerage's legal counsel or state association hotline for anything they cannot settle.",
    referTo: "your broker or legal counsel",
  },
  {
    boundary: "tax",
    patterns: [
      /\b(deduct|deductible|write off|write-off)\b/i,
      /\b(capital gains|1031|schedule c|self-employment tax|quarterly taxes)\b/i,
      /\bhow (much|do i) .{0,20}\btax(es)?\b/i,
      /\btax (implications|consequences|advice|treatment)\b/i,
    ],
    response:
      "That is a tax question, and the answer depends on your whole return rather than one transaction — I am not able to advise on it. A CPA who works with real-estate agents will settle it quickly.",
    referTo: "a CPA",
  },
  {
    boundary: "valuation",
    patterns: [
      // "Worth" is a valuation question whatever follows "what is" — including
      // a bare address, which no noun list would catch.
      /\bwhat (is|are)\b.{0,40}\bworth\b/i,
      // "Value" is not. "What is the value of adding IDX to my site?" is a
      // product question, and meeting it with an appraisal disclaimer is how
      // Zack stops being useful — so this one has to name a property.
      /\bwhat (is|are)\b.{0,30}\b(house|home|property|condo|listing|land|lot|unit|building)\b.{0,20}\bvalue\b/i,
      /\bvalue of (my|the|this|that|his|her|their) (house|home|property|condo|listing|land|lot|unit|building)\b/i,
      /\bhow much (is|should) .{0,30}\b(worth|list for|sell for|price)\b/i,
      // "how much should I list this house for" — the verb and its preposition
      // are separated by the object, so the contiguous form above misses it.
      /\bhow much (should|would|can|could) (i|we|they|my client)\b.{0,30}\b(list|price|sell|ask)\b/i,
      /\b(appraise|appraisal value|estimate the value)\b/i,
    ],
    response:
      "I cannot put a value on a specific property — I have no access to the comparables or the condition, and a number from me could end up in front of a client as though it were supported. Run a CMA from your MLS, or order an appraisal where one is warranted.",
    referTo: "your MLS comparables or a licensed appraiser",
  },
  {
    boundary: "lending",
    patterns: [
      /\b(will|would|can) (they|he|she|my client|the buyer) (qualify|be approved)\b/i,
      /\bwhat (rate|interest rate|loan|mortgage) (should|can|will)\b/i,
      /\b(pre-?approval|pre-?qualify|debt.to.income|dti)\b.{0,30}\b(should|can|will|advice)\b/i,
    ],
    response:
      "Whether someone qualifies, and on what terms, is a lender's call — steering a client on financing is not something I can do. Send them to a licensed loan officer, and I will handle the follow-up around it.",
    referTo: "a licensed loan officer",
  },
  {
    boundary: "fair-housing-screening",
    patterns: [
      // Requests to filter, target, or describe by protected class. This is
      // the one boundary where the operator may not realise they are asking
      // for something unlawful, so the reply explains rather than just
      // declining.
      /\b(only|just)\s+(show|send|market|target)\b.{0,40}\b(families|christians|muslims|jews|singles|couples|whites?|blacks?|hispanics?|asians?)\b/i,
      /\b(filter|segment|exclude|screen)\b.{0,30}\b(by|out)\b.{0,20}\b(race|religion|national origin|familial status|disability|ethnicity|colou?r|sex|gender)\b/i,
      /\b(good|bad|safe|dangerous|rough)\s+(neighbou?rhood|area|schools?)\s+for\b/i,
      /\bwhat kind of people\b.{0,25}\b(live|neighbou?rhood|area)\b/i,
    ],
    response:
      "I cannot target or filter marketing by any protected class, or characterise who lives in an area — under the Fair Housing Act that is unlawful whether or not it was meant that way, and it is the agent who carries the penalty. I can segment by anything about the *transaction* instead: price range, timeline, property type, area, or how the lead came in. Tell me which and I will set it up.",
    referTo: "your broker if you are unsure whether a segment is safe",
  },
];

/**
 * Check an operator's message against the boundaries.
 *
 * Returns the first hit rather than all of them: one clear redirection is more
 * useful than a list of everything wrong with the question.
 */
export function checkAdviceBoundaries(message: string): BoundaryHit | null {
  const text = (message || "").trim();
  if (!text) return null;

  for (const rule of RULES) {
    if (rule.patterns.some((pattern) => pattern.test(text))) {
      return {
        boundary: rule.boundary,
        response: rule.response,
        referTo: rule.referTo,
      };
    }
  }
  return null;
}

/** The boundaries, for the system prompt, so the model declines in the same voice. */
export function boundarySummaryForPrompt(): string {
  return RULES.map(
    (r) => `- ${r.boundary}: decline and refer to ${r.referTo}.`
  ).join("\n");
}
