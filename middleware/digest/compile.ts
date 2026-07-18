import type { WeeklyDigest, WeeklyDigestInputs } from "./types";

/**
 * Pure compiler for the weekly "Your AI employee: X replies, Y bookings,
 * Z revived" digest. No I/O — unit/snapshot-tested directly.
 */
export function compileWeeklyDigest(inputs: WeeklyDigestInputs): WeeklyDigest {
  const isEmpty =
    inputs.repliesSent === 0 &&
    inputs.bookingsCreated === 0 &&
    inputs.leadsRevived === 0 &&
    inputs.dealsWon === 0;

  const headline = isEmpty
    ? "A quiet week — no automated activity to report."
    : `${inputs.repliesSent} ${plural(inputs.repliesSent, "reply", "replies")}, ${inputs.bookingsCreated} ${plural(inputs.bookingsCreated, "booking", "bookings")}, ${inputs.leadsRevived} lead${inputs.leadsRevived === 1 ? "" : "s"} revived`;

  const smsText = isEmpty
    ? "Your AI employee's week: quiet — no automated activity to report."
    : `Your AI employee this week: ${headline}.`;

  return {
    headline,
    smsText: smsText.length > 320 ? `${smsText.slice(0, 317)}...` : smsText,
    isEmpty,
    repliesSent: inputs.repliesSent,
    bookingsCreated: inputs.bookingsCreated,
    leadsRevived: inputs.leadsRevived,
    dealsWon: inputs.dealsWon,
    dealsWonValue: inputs.dealsWonValue,
  };
}

function plural(count: number, singular: string, pluralForm: string): string {
  return count === 1 ? singular : pluralForm;
}
