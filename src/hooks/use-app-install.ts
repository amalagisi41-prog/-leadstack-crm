"use client";

import { useCallback, useEffect, useState } from "react";
import {
  decidePrompt,
  detectPlatform,
  nextSnoozeUntil,
  requiresManualInstall,
  type InstallPlatform,
} from "@/lib/pwa/install-state";

const INSTALLED_KEY = "agentstack:app-installed:v1";
const SNOOZE_KEY = "agentstack:app-install-snoozed-until:v1";
const DISMISS_COUNT_KEY = "agentstack:app-install-dismissals:v1";
const SESSION_KEY = "agentstack:app-install-prompted-this-session:v1";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export interface AppInstall {
  /** Interrupt the user now. */
  shouldPrompt: boolean;
  /** Keep the sidebar entry and download page relevant. */
  showCallout: boolean;
  platform: InstallPlatform;
  /** True once a browser has offered us its native install flow. */
  canInstallDirectly: boolean;
  /** No install button will ever appear here; show steps instead. */
  manualOnly: boolean;
  /** Run the browser's own install flow. Resolves true if they accepted. */
  install: () => Promise<boolean>;
  /** "Remind me later" — snoozes, escalating each time. */
  snooze: () => void;
  /** "I've already added it" — the only signal iOS will ever give us. */
  markInstalled: () => void;
  /** Best-effort: proof on Chromium, self-reported on iOS. */
  installed: boolean;
}

const read = (store: Storage | undefined, key: string) => {
  try {
    return store?.getItem(key) ?? null;
  } catch {
    // Safari in private mode throws on storage access rather than returning
    // null. Treat that as "nothing recorded" instead of taking the page down.
    return null;
  }
};
const writeKey = (store: Storage | undefined, key: string, value: string) => {
  try {
    store?.setItem(key, value);
  } catch {
    /* private mode — the prompt simply repeats, which is the safe direction */
  }
};

/**
 * Everything the install prompt, the sidebar callout, and the download page
 * need to agree on.
 *
 * All three read from here so they cannot disagree about whether the app is
 * installed — a sidebar nagging someone to download what they are already
 * running is the exact failure this centralisation prevents.
 */
export function useAppInstall(): AppInstall {
  const [event, setEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [platform, setPlatform] = useState<InstallPlatform>("other");
  const [decision, setDecision] = useState({ prompt: false, showCallout: false });
  const [installed, setInstalled] = useState(false);

  const refresh = useCallback(() => {
    const runningStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      // iOS Safari's own non-standard flag for "launched from the home screen".
      (navigator as unknown as { standalone?: boolean }).standalone === true;

    // Running standalone is proof, so record it — but see the note in
    // install-state.ts: on iOS this write may land in storage the browser tab
    // cannot read, which is why `markInstalled` exists as a manual fallback.
    if (runningStandalone) writeKey(window.localStorage, INSTALLED_KEY, "1");

    const knownInstalled =
      runningStandalone || read(window.localStorage, INSTALLED_KEY) === "1";
    setInstalled(knownInstalled);
    setDecision(
      decidePrompt({
        installed: knownInstalled,
        snoozedUntil: read(window.localStorage, SNOOZE_KEY),
        shownThisSession: read(window.sessionStorage, SESSION_KEY) === "1",
        runningStandalone,
        now: new Date(),
      })
    );
  }, []);

  useEffect(() => {
    setPlatform(
      detectPlatform({
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        maxTouchPoints: navigator.maxTouchPoints,
      })
    );
    refresh();

    function onBeforeInstallPrompt(e: Event) {
      // Suppress the browser's own mini-infobar so our prompt is the only one.
      e.preventDefault();
      setEvent(e as BeforeInstallPromptEvent);
      setPlatform("chromium");
    }
    function onInstalled() {
      writeKey(window.localStorage, INSTALLED_KEY, "1");
      setEvent(null);
      refresh();
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, [refresh]);

  // Mark the session as prompted the moment we decide to show it, so moving
  // between screens does not re-open the modal.
  useEffect(() => {
    if (decision.prompt) writeKey(window.sessionStorage, SESSION_KEY, "1");
  }, [decision.prompt]);

  const install = useCallback(async () => {
    if (!event) return false;
    await event.prompt();
    const { outcome } = await event.userChoice;
    if (outcome === "accepted") {
      writeKey(window.localStorage, INSTALLED_KEY, "1");
    }
    setEvent(null);
    refresh();
    return outcome === "accepted";
  }, [event, refresh]);

  const snooze = useCallback(() => {
    const count = Number(read(window.localStorage, DISMISS_COUNT_KEY) ?? "0");
    const dismissals = Number.isFinite(count) ? count : 0;
    writeKey(window.localStorage, DISMISS_COUNT_KEY, String(dismissals + 1));
    writeKey(
      window.localStorage,
      SNOOZE_KEY,
      nextSnoozeUntil(dismissals, new Date())
    );
    setDecision((d) => ({ ...d, prompt: false }));
  }, []);

  const markInstalled = useCallback(() => {
    writeKey(window.localStorage, INSTALLED_KEY, "1");
    refresh();
  }, [refresh]);

  return {
    shouldPrompt: decision.prompt,
    showCallout: decision.showCallout,
    platform,
    canInstallDirectly: event !== null,
    manualOnly: requiresManualInstall(platform),
    install,
    snooze,
    markInstalled,
    installed,
  };
}
