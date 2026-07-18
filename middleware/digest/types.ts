/**
 * The Weekly Digest — pure summary compiler. Same portable-by-design
 * posture as @middleware/briefing: no Firestore, no Admin SDK. The
 * orchestrator (src/lib/digest/send.ts) fetches raw counts and calls
 * compileWeeklyDigest(); the app's existing email adapter sends it.
 */

export interface WeeklyDigestInputs {
  /** AI/automated replies sent this week (Method Template + Workflow send
   *  nodes that completed successfully). */
  repliesSent: number;
  /** Calendar events created via a booking page this week. */
  bookingsCreated: number;
  /** Distinct contacts the cold-lead 90-day-revival Method Template
   *  re-enrolled this week. */
  leadsRevived: number;
  /** Deals moved to Won this week — a secondary headline, shown only
   *  when nonzero. */
  dealsWon: number;
  dealsWonValue: number;
}

export interface WeeklyDigest {
  headline: string;
  smsText: string;
  isEmpty: boolean;
  repliesSent: number;
  bookingsCreated: number;
  leadsRevived: number;
  dealsWon: number;
  dealsWonValue: number;
}
