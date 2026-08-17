/**
 * Keeping an installed app on the current version.
 *
 * Most of this is free: the service worker caches only icons and the offline
 * page, and every navigation and data request is network-first, so a cold
 * start of the installed app always gets whatever is deployed. Nothing about
 * the product is bundled into the install.
 *
 * The gap is an app that is never cold-started. Nobody quits apps on a phone —
 * they background them for weeks — and a page left open goes on running the
 * JavaScript it loaded on day one. It will keep talking to the API correctly,
 * but it is old code, and after a deploy its lazily-loaded chunks may no
 * longer exist on the server at all. So a running app has to notice a new
 * version and reload itself.
 *
 * When it reloads is the whole design. Yanking the page out from under someone
 * mid-sentence in a lead note is worse than being a version behind, so the
 * reload waits for a moment when nothing is lost: the app being backgrounded.
 * That is invisible — they come back to the new version and never saw a
 * refresh. A desktop tab that is never hidden gets told instead, and chooses.
 */

/** How often a running app re-checks for a new service worker. */
export const UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000;

/**
 * How long to wait, with the app visible, before offering the reload.
 *
 * Long enough that a user who is about to switch away is not interrupted for
 * nothing; short enough that someone parked on one screen all afternoon still
 * gets the fix that was shipped for them.
 */
export const NOTIFY_AFTER_VISIBLE_MS = 90 * 1000;

export interface UpdateAction {
  /** Reload immediately — safe, because nothing is on screen to lose. */
  reload: boolean;
  /** Offer the reload and let the user pick the moment. */
  notify: boolean;
}

const NOTHING: UpdateAction = { reload: false, notify: false };

/**
 * What to do about a version that is ready but not yet running.
 *
 * `documentHidden` is the safety interlock: hidden means backgrounded or on
 * another tab, so a reload costs the user nothing and they will never see it
 * happen.
 */
export function decideUpdateAction(input: {
  updateReady: boolean;
  documentHidden: boolean;
  msSinceUpdateReady: number;
  alreadyNotified: boolean;
}): UpdateAction {
  const { updateReady, documentHidden, msSinceUpdateReady, alreadyNotified } =
    input;

  if (!updateReady) return NOTHING;
  if (documentHidden) return { reload: true, notify: false };
  if (alreadyNotified) return NOTHING;
  if (msSinceUpdateReady >= NOTIFY_AFTER_VISIBLE_MS) {
    return { reload: false, notify: true };
  }
  return NOTHING;
}

/**
 * Whether a change of controlling service worker means a new version.
 *
 * On a first-ever visit the worker installs and calls `clients.claim()`, which
 * fires the same event — treating that as an update would reload the page
 * immediately after every first load, forever. The distinction is whether a
 * controller existed beforehand.
 */
export function isVersionChange(hadControllerBeforeRegistering: boolean): boolean {
  return hadControllerBeforeRegistering;
}
