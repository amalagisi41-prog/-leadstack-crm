/**
 * Canonical sub-account route segments.
 *
 * Onboarding, the agency getting-started tabs, and settings all hardcoded
 * `/automations` — a route that does not exist (the product route is
 * `/workflows`), so every one of those CTAs 404'd. Centralizing the segments
 * here means a rename breaks the build instead of shipping a dead link, and
 * `LEGACY_SUB_ACCOUNT_ROUTES` documents redirects we keep for old bookmarks.
 *
 * Plain data, no JSX — safe to import from server routes and client
 * components alike.
 */

export const SUB_ACCOUNT_ROUTES = {
  dashboard: "/dashboard",
  settings: "/dashboard/settings",
  workflows: "/workflows",
  forms: "/forms",
  contacts: "/contacts",
  pipeline: "/pipeline",
  properties: "/properties",
  /**
   * The inventory browser. Still mounted at `/idx` for bookmark stability,
   * though it is no longer IDX-only — it lists off-market property too, and
   * renders without an IDX Broker connection.
   */
  listings: "/idx",
  calendar: "/calendar",
  booking: "/booking",
  domain: "/domain",
  websiteStudio: "/website-studio",
  website: "/website-studio",
  websiteStudioVibe: "/website-studio/vibe",
  businessProfile: "/business-profile",
  aiAgents: "/ai-agents",
  siteHealth: "/site-health",
  getStarted: "/get-started",

  messagingSettings: "/dashboard/settings?tab=messaging",
  marketingCampaigns: "/marketing/campaigns",
} as const;

export type SubAccountRouteKey = keyof typeof SUB_ACCOUNT_ROUTES;

/**
 * Paths that shipped in earlier builds and may exist in bookmarks, saved
 * onboarding emails, or agency documentation. Each redirects to its current
 * home rather than 404ing.
 */
export const LEGACY_SUB_ACCOUNT_ROUTES: Record<string, string> = {
  "/automations": SUB_ACCOUNT_ROUTES.workflows,
  "/automations/settings": SUB_ACCOUNT_ROUTES.workflows,
};

/**
 * The workspace home for whichever sub-account a path belongs to, or null
 * when the path names none.
 *
 * The 404 page used to send everyone to the bare `/dashboard`, which is the
 * legacy flat route: a member who mistyped a URL inside their own workspace
 * got bounced out through the redirect stub instead of back to where they
 * were. Reading the sub-account out of the address they already have is the
 * "never ask for something the app can find out" rule applied to the one
 * screen where a user is most lost.
 */
export function subAccountHomeFromPath(pathname: string): string | null {
  const id = /^\/sa\/([^/?#]+)/.exec(pathname ?? "")?.[1];
  // A bare "/sa/" leaves an empty capture, and a literal "undefined" is what
  // a broken href interpolation produces — neither names a workspace.
  if (!id || id === "undefined" || id === "null") return null;
  return `/sa/${id}${SUB_ACCOUNT_ROUTES.dashboard}`;
}
