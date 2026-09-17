/**
 * Known RPR MLS-SSO board codes, so an agent picks their MLS by name
 * instead of hunting a `cbcode` query parameter out of a URL.
 *
 * The code is a fixed per-board constant — every SmartMLS member shares
 * `ctconnm-n`. An agent always knows the name of the MLS they sign into
 * daily; they have no idea what a "cbcode" is. Asking for the name and
 * deriving the code is the same read-don't-ask trade the rest of the
 * onboarding surfaces make.
 *
 * ────────────────────────────────────────────────────────────────────
 * NEVER ADD A GUESSED CODE.
 *
 * Every entry here must have been confirmed against a live RPR session
 * for that board — sign in through the MLS, open RPR, read the `cbcode`
 * from the address bar. A wrong code doesn't error: it sends the agent to
 * an SSO entry that fails or lands them somewhere unexpected, which reads
 * as our bug and is exactly the "silently falls back to defaults, which
 * would look broken" failure CLAUDE.md calls out for gitpage's dropdowns.
 *
 * An unlisted MLS is not a blocker — the settings card falls back to
 * pasting the RPR URL, which `parseRprOrgId()` reads the code out of. A
 * short honest list beats a long speculative one.
 * ────────────────────────────────────────────────────────────────────
 */

export interface RprBoard {
  /** RPR's `cbcode` for this board's MLS-SSO entry point. */
  orgId: string;
  /** The name the agent knows the MLS by. */
  label: string;
  /** Shown beside the name to disambiguate similar board names. */
  region: string;
}

export const VERIFIED_RPR_BOARDS: RprBoard[] = [
  {
    orgId: "ctconnm-n",
    label: "SmartMLS (connectMLS)",
    region: "Connecticut",
  },
];

export function findRprBoard(orgId: string): RprBoard | null {
  return (
    VERIFIED_RPR_BOARDS.find((board) => board.orgId === orgId) ?? null
  );
}
