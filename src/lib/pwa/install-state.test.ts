import { describe, expect, it } from "vitest";
import {
  SNOOZE_LADDER_DAYS,
  decidePrompt,
  detectPlatform,
  nextSnoozeUntil,
  requiresManualInstall,
} from "./install-state";

const NOW = new Date("2026-08-17T12:00:00Z");
const days = (n: number) =>
  new Date(NOW.getTime() + n * 86_400_000).toISOString();

describe("which install route a device has", () => {
  it("routes every iPhone browser through the Share sheet", () => {
    // Chrome on iOS is WebKit underneath and installs exactly like Safari.
    // Handing it the Chromium instructions sends the user hunting for an
    // install button that platform will never show.
    for (const ua of [
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/605.1",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) CriOS/120 Mobile",
      "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) Safari/605.1",
    ]) {
      expect(
        detectPlatform({ userAgent: ua, platform: "iPhone", maxTouchPoints: 5 }),
        ua
      ).toBe("ios");
    }
  });

  it("catches an iPad masquerading as a Mac", () => {
    // iPadOS reports MacIntel; the touch screen is the only tell.
    expect(
      detectPlatform({
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1",
        platform: "MacIntel",
        maxTouchPoints: 5,
      })
    ).toBe("ios");
  });

  it("separates desktop Safari from Chromium", () => {
    expect(
      detectPlatform({
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Version/17 Safari/605.1",
        platform: "MacIntel",
        maxTouchPoints: 0,
      })
    ).toBe("safari-desktop");
    for (const ua of [
      "Mozilla/5.0 (Windows NT 10.0) Chrome/120 Safari/537.36",
      "Mozilla/5.0 (Macintosh) Chrome/120 Safari/537.36 Edg/120",
    ]) {
      expect(
        detectPlatform({ userAgent: ua, platform: "Win32", maxTouchPoints: 0 }),
        ua
      ).toBe("other");
    }
  });

  it("knows which platforms can never show an install button", () => {
    expect(requiresManualInstall("ios")).toBe(true);
    expect(requiresManualInstall("safari-desktop")).toBe(true);
    expect(requiresManualInstall("chromium")).toBe(false);
  });
});

describe("how often the prompt comes back", () => {
  it("lengthens the gap each time it is dismissed", () => {
    const gaps = [0, 1, 2].map((n) => nextSnoozeUntil(n, NOW));
    expect(gaps).toEqual(SNOOZE_LADDER_DAYS.map((d) => days(d)));
  });

  it("stops lengthening rather than snoozing for years", () => {
    expect(nextSnoozeUntil(99, NOW)).toBe(days(30));
  });

  it("treats a nonsense dismiss count as the first one", () => {
    expect(nextSnoozeUntil(-5, NOW)).toBe(days(SNOOZE_LADDER_DAYS[0]));
  });
});

describe("whether to interrupt this sign-in", () => {
  const base = {
    installed: false,
    snoozedUntil: null as string | null,
    shownThisSession: false,
    runningStandalone: false,
    now: NOW,
  };

  it("prompts a new user who has never been asked", () => {
    expect(decidePrompt(base)).toEqual({ prompt: true, showCallout: true });
  });

  it("says nothing at all inside the installed app", () => {
    // Advertising the download to someone using the download is the clearest
    // possible signal that nobody checked.
    expect(decidePrompt({ ...base, runningStandalone: true })).toEqual({
      prompt: false,
      showCallout: false,
    });
    expect(decidePrompt({ ...base, installed: true })).toEqual({
      prompt: false,
      showCallout: false,
    });
  });

  it("holds off while snoozed, but keeps the sidebar route open", () => {
    expect(decidePrompt({ ...base, snoozedUntil: days(2) })).toEqual({
      prompt: false,
      showCallout: true,
    });
  });

  it("comes back once the snooze expires", () => {
    expect(decidePrompt({ ...base, snoozedUntil: days(-1) }).prompt).toBe(true);
  });

  it("interrupts once per session, not once per page", () => {
    expect(decidePrompt({ ...base, shownThisSession: true })).toEqual({
      prompt: false,
      showCallout: true,
    });
  });

  it("treats a corrupt snooze value as never snoozed", () => {
    // Failing the other way would silently retire the prompt for that user,
    // and nobody would ever find out.
    for (const bad of ["", "soon", "NaN", "2026-13-45T99:00:00Z"]) {
      expect(decidePrompt({ ...base, snoozedUntil: bad }).prompt, bad).toBe(true);
    }
  });
});
