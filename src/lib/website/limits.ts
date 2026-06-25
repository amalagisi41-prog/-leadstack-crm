/**
 * Per-sub-account cap on the number of website builds. The website doc lives
 * at `subAccounts/{id}/website/{siteId}` — a sub-account can hold up to this
 * many at once. Enforced server-side in the create-site route
 * (`POST /api/sub-accounts/[id]/website`) and mirrored in the UI's "Add
 * website" affordance. Bump this single constant to change the limit.
 */
export const MAX_WEBSITES_PER_SUBACCOUNT = 5;
