import { describe, expect, it } from "vitest";
import {
  NOTIFY_AFTER_VISIBLE_MS,
  UPDATE_CHECK_INTERVAL_MS,
  decideUpdateAction,
  isVersionChange,
} from "./update-policy";

/**
 * Two failures these hold the line on, both of which are worse than being a
 * version behind:
 *
 *  1. Reloading while someone is typing. The app is a CRM; the text on screen
 *     is often a note about a client taken during a call.
 *  2. Reload loops. `clients.claim()` fires a controller change on the very
 *     first visit too, and treating that as an update reloads the page
 *     immediately after every first load — forever, on every device.
 */

const base = {
  updateReady: true,
  documentHidden: false,
  msSinceUpdateReady: 0,
  alreadyNotified: false,
};

describe("when a running app may reload itself", () => {
  it("does nothing at all until there is a new version", () => {
    expect(
      decideUpdateAction({ ...base, updateReady: false, documentHidden: true })
    ).toEqual({ reload: false, notify: false });
  });

  it("reloads silently once the app is backgrounded", () => {
    // The whole point: the user returns to the new version having never seen
    // a refresh happen.
    expect(decideUpdateAction({ ...base, documentHidden: true })).toEqual({
      reload: true,
      notify: false,
    });
  });

  it("never reloads under someone who is looking at the screen", () => {
    for (const ms of [0, 1000, NOTIFY_AFTER_VISIBLE_MS, 10 * NOTIFY_AFTER_VISIBLE_MS]) {
      expect(
        decideUpdateAction({ ...base, msSinceUpdateReady: ms }).reload,
        `visible at ${ms}ms`
      ).toBe(false);
    }
  });

  it("holds its tongue briefly, in case they are about to switch away", () => {
    expect(
      decideUpdateAction({ ...base, msSinceUpdateReady: 5_000 })
    ).toEqual({ reload: false, notify: false });
  });

  it("offers the reload to someone parked on one screen", () => {
    expect(
      decideUpdateAction({ ...base, msSinceUpdateReady: NOTIFY_AFTER_VISIBLE_MS })
    ).toEqual({ reload: false, notify: true });
  });

  it("only offers once, however long they stay", () => {
    expect(
      decideUpdateAction({
        ...base,
        msSinceUpdateReady: 60 * 60 * 1000,
        alreadyNotified: true,
      })
    ).toEqual({ reload: false, notify: false });
  });

  it("still reloads on background even after the offer was shown", () => {
    // Declining to click "Reload" is not declining the update.
    expect(
      decideUpdateAction({
        ...base,
        documentHidden: true,
        alreadyNotified: true,
        msSinceUpdateReady: 60 * 60 * 1000,
      })
    ).toEqual({ reload: true, notify: false });
  });
});

describe("telling a new version from a first install", () => {
  it("does not treat the first-ever install as an update", () => {
    // clients.claim() fires a controller change on first visit. Reading that
    // as a new version reloads the page right after every first load.
    expect(isVersionChange(false)).toBe(false);
  });

  it("treats a controller swap on an already-controlled page as an update", () => {
    expect(isVersionChange(true)).toBe(true);
  });
});

describe("the polling interval", () => {
  it("is frequent enough to matter and rare enough to ignore", () => {
    // A background app should pick up a fix the same working day without
    // making a request every few minutes on a metered phone connection.
    expect(UPDATE_CHECK_INTERVAL_MS).toBeGreaterThanOrEqual(5 * 60 * 1000);
    expect(UPDATE_CHECK_INTERVAL_MS).toBeLessThanOrEqual(60 * 60 * 1000);
  });
});
