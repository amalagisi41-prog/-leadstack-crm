"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import {
  NOTIFY_AFTER_VISIBLE_MS,
  UPDATE_CHECK_INTERVAL_MS,
  decideUpdateAction,
  isVersionChange,
} from "@/lib/pwa/update-policy";

/**
 * Registers /sw.js and keeps an installed app on the current version.
 *
 * Mounted once in the root layout so it covers every route (marketing landing
 * + dashboard), which is required for Chrome/Android to treat the site as
 * installable.
 *
 * Registering is the easy half. The half that matters for a deployed product
 * is that nobody quits apps on a phone: a page opened in March is still the
 * March bundle in June, and after a deploy its lazily-loaded chunks may not
 * exist on the server any more. So this polls for a new worker, and when one
 * takes over, reloads at a moment that costs the user nothing — see
 * update-policy.ts for why that moment is "when the app is backgrounded".
 */
export function RegisterServiceWorker() {
  const notified = useRef(false);
  const readyAt = useRef<number | null>(null);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    // Held for the lifetime of the effect rather than re-read on cleanup, so
    // teardown detaches from the same container it attached to.
    const sw = navigator.serviceWorker;

    // Captured before registering: on a first-ever visit there is no
    // controller, and the worker's own clients.claim() fires the same
    // controllerchange event. Without this, every first load would reload
    // itself a moment later, forever.
    const hadController = Boolean(sw.controller);

    let registration: ServiceWorkerRegistration | null = null;
    let disposed = false;

    function act() {
      if (disposed || readyAt.current === null) return;
      const { reload, notify } = decideUpdateAction({
        updateReady: true,
        documentHidden: document.visibilityState === "hidden",
        msSinceUpdateReady: Date.now() - readyAt.current,
        alreadyNotified: notified.current,
      });
      if (reload) {
        window.location.reload();
        return;
      }
      if (notify) {
        notified.current = true;
        toast("A new version of AgentStack is ready", {
          description:
            "Reload when you are ready. It will also update on its own next time you switch away.",
          duration: Infinity,
          action: {
            label: "Reload",
            onClick: () => window.location.reload(),
          },
        });
      }
    }

    function onControllerChange() {
      if (!isVersionChange(hadController)) return;
      if (readyAt.current === null) readyAt.current = Date.now();
      act();
    }

    function onVisibility() {
      // Both directions matter: hidden is when a reload is free, and visible
      // is the cheapest possible moment to check for a new version.
      act();
      if (document.visibilityState === "visible") {
        registration?.update().catch(() => {});
      }
    }

    sw.register("/sw.js")
      .then((reg) => {
        if (disposed) return;
        registration = reg;
        // Ask once on load: the browser's own check can be up to 24h apart.
        reg.update().catch(() => {});
      })
      .catch(() => {
        // Installability is a nice-to-have, not a hard requirement -- a
        // registration failure (e.g. an unsupported browser) should never
        // surface to the user or block anything else on the page.
      });

    sw.addEventListener("controllerchange", onControllerChange);
    document.addEventListener("visibilitychange", onVisibility);

    const poll = window.setInterval(() => {
      registration?.update().catch(() => {});
      act();
    }, UPDATE_CHECK_INTERVAL_MS);

    // While the app is visible the notify threshold has to be reached by
    // something; the poll interval alone is longer than it.
    const nudge = window.setInterval(act, NOTIFY_AFTER_VISIBLE_MS);

    return () => {
      disposed = true;
      sw.removeEventListener("controllerchange", onControllerChange);
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(poll);
      window.clearInterval(nudge);
    };
  }, []);

  return null;
}
