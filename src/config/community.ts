/**
 * Community + Courses — central config (single source of truth for naming,
 * gamification thresholds, and limits). Client-safe: no secrets, no
 * `server-only` import, so both server routes and client components can read it.
 */

export const COMMUNITY = {
  /** Sidebar + surface label. */
  name: "Community",
} as const;

/** Max length of a group's public "About" copy. Enforced server + client. */
export const ABOUT_MAX_CHARS = 1000;

/** Max length of the short join-card tagline. Enforced server + client. */
export const TAGLINE_MAX_CHARS = 100;

/**
 * Skool's exact points→level curve (1 like = 1 point, per-group). A member's
 * level is the highest entry whose threshold is ≤ their points. Used by the
 * gamification slice + level-locked courses; defined here so the auth slice and
 * later slices share one table.
 */
export const LEVEL_THRESHOLDS: readonly number[] = [
  0, // Level 1
  5, // Level 2
  20, // Level 3
  65, // Level 4
  155, // Level 5
  515, // Level 6
  2015, // Level 7
  8015, // Level 8
  33015, // Level 9
] as const;

/** Resolve a points total to a 1–9 level. */
export function levelForPoints(points: number): number {
  let level = 1;
  for (let i = 0; i < LEVEL_THRESHOLDS.length; i++) {
    if (points >= LEVEL_THRESHOLDS[i]) level = i + 1;
  }
  return level;
}
