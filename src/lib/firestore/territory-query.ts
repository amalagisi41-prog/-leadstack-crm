import { where, type QueryConstraint } from "firebase/firestore";

/**
 * Translate an effective territory filter into a query plan. Centralises
 * the three cases so every scoped subscribe behaves identically:
 *
 *  - `null`  → no filter (admin / owner / scoping off): return all.
 *  - `[]`    → scoped collaborator with NO territories: they may see
 *              nothing. We must NOT run an unfiltered query — Firestore
 *              rules aren't filters, so an unfiltered query would be
 *              rejected wholesale with permission-denied rather than
 *              returning empty. Signal the caller to short-circuit to an
 *              empty result.
 *  - ids[]   → `where("territoryId","in", ids)`. Capped at Firestore's
 *              30-item `in` limit (sliced defensively; member assignment
 *              is capped at 30 upstream so this never drops real data).
 */
export type TerritoryQueryPlan =
  | { mode: "all" }
  | { mode: "empty" }
  | { mode: "in"; constraint: QueryConstraint };

export function territoryQueryPlan(
  filter: string[] | null | undefined,
): TerritoryQueryPlan {
  if (!filter) return { mode: "all" };
  if (filter.length === 0) return { mode: "empty" };
  return {
    mode: "in",
    constraint: where("territoryId", "in", filter.slice(0, 30)),
  };
}

/** Shared no-op unsubscribe for the short-circuit (empty) path. */
export const NOOP_UNSUB = () => {};
