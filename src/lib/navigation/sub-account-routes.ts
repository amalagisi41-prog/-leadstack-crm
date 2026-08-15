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
  calendar: "/calendar",
  booking: "/booking",
  domain: "/domain",
  websiteStudio: "/website-studio",
  websiteStudioVibe: "/website-studio/vibe",
  businessProfile: "/business-profile",
  aiAgents: "/ai-agents",
  siteHealth: "/site-health",
  getStarted: "/get-started",
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
