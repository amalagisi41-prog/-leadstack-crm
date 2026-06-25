/**
 * Shared shape + defaults for the landing page's "Updates" modal — a small,
 * on-brand "what's new" popup the agency owner edits weekly to surface recent
 * product updates (Community & Courses, Workflow Builder, Social Planner, …).
 *
 * Persisted at `appConfig/updatesModal` (server-only writes via the Admin SDK;
 * public read for the unauthenticated landing page). Kept free of any
 * client-only imports so both the client read-hook and server components can
 * import it. Mirrors the exit-intent config feature exactly.
 */

/** A single line in the updates list. */
export interface UpdateItem {
  /** Headline, e.g. "Community & Courses". */
  title: string;
  /** Optional one-line detail under the title. */
  description: string;
  /** Optional pill, e.g. "Beta" / "New". Empty hides the pill. */
  badge: string;
}

export interface UpdatesModalConfig {
  /** Master on/off. When false the modal never shows. */
  enabled: boolean;
  /** Modal heading, e.g. "What's new". */
  heading: string;
  /** Optional supporting line under the heading. */
  subheading: string;
  /** Seconds from page load before the modal appears. */
  delaySeconds: number;
  /** The updates list, newest first. */
  items: UpdateItem[];
}

/** Hard caps so an untrusted payload can't bloat the doc or the prompt. */
export const UPDATES_MAX_ITEMS = 12;
export const UPDATES_HEADING_MAX = 80;
export const UPDATES_SUBHEADING_MAX = 200;
export const UPDATES_ITEM_TITLE_MAX = 80;
export const UPDATES_ITEM_DESC_MAX = 160;
export const UPDATES_ITEM_BADGE_MAX = 24;
/** Cap the delay at 10 minutes — anything longer is effectively "never". */
export const UPDATES_DELAY_MAX_SECONDS = 600;

/**
 * Defaults shown until the agency owner saves once (or if the doc is missing /
 * Firebase isn't configured). Seeded with the current headline features so the
 * modal is useful out of the box.
 */
export const UPDATES_MODAL_DEFAULTS: UpdatesModalConfig = {
  enabled: false,
  heading: "What's new",
  subheading: "Recent updates shipped to your CRM.",
  delaySeconds: 4,
  items: [
    {
      title: "Community & Courses",
      description: "Skool-style groups with a feed, classroom, and leaderboards.",
      badge: "New",
    },
    {
      title: "Workflow Builder",
      description: "Visual, step-by-step automations — no flowchart spaghetti.",
      badge: "New",
    },
    {
      title: "Social Media Planner",
      description: "Schedule and auto-publish posts to Facebook & Instagram.",
      badge: "Beta",
    },
  ],
};

function clampString(v: unknown, max: number, fallback = ""): string {
  if (typeof v !== "string") return fallback;
  return v.trim().slice(0, max);
}

/** Normalize one untrusted item; returns null when it has no title. */
function coerceItem(data: unknown): UpdateItem | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Partial<UpdateItem>;
  const title = clampString(d.title, UPDATES_ITEM_TITLE_MAX);
  if (!title) return null;
  return {
    title,
    description: clampString(d.description, UPDATES_ITEM_DESC_MAX),
    badge: clampString(d.badge, UPDATES_ITEM_BADGE_MAX),
  };
}

/** Normalize an untrusted Firestore payload to a complete, valid config. */
export function coerceUpdatesModalConfig(
  data: Partial<UpdatesModalConfig> | undefined | null,
): UpdatesModalConfig {
  if (!data) return { ...UPDATES_MODAL_DEFAULTS, items: [...UPDATES_MODAL_DEFAULTS.items] };

  const rawDelay = data.delaySeconds;
  const delaySeconds =
    typeof rawDelay === "number" && Number.isFinite(rawDelay) && rawDelay >= 0
      ? Math.min(Math.floor(rawDelay), UPDATES_DELAY_MAX_SECONDS)
      : UPDATES_MODAL_DEFAULTS.delaySeconds;

  const items = Array.isArray(data.items)
    ? data.items
        .map(coerceItem)
        .filter((x): x is UpdateItem => x !== null)
        .slice(0, UPDATES_MAX_ITEMS)
    : [...UPDATES_MODAL_DEFAULTS.items];

  return {
    enabled:
      typeof data.enabled === "boolean"
        ? data.enabled
        : UPDATES_MODAL_DEFAULTS.enabled,
    heading: clampString(
      data.heading,
      UPDATES_HEADING_MAX,
      UPDATES_MODAL_DEFAULTS.heading,
    ),
    subheading: clampString(data.subheading, UPDATES_SUBHEADING_MAX),
    delaySeconds,
    items,
  };
}

/**
 * A stable content signature. Returning visitors store the last signature they
 * dismissed in localStorage; the modal re-shows only when this changes — so
 * editing the list (a weekly update) re-surfaces it without re-popping on every
 * page view. Heading + items participate; the delay does not.
 */
export function updatesContentSignature(c: UpdatesModalConfig): string {
  return JSON.stringify({
    h: c.heading,
    s: c.subheading,
    i: c.items.map((it) => [it.title, it.description, it.badge]),
  });
}
