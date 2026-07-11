"use client";

import { useEffect } from "react";

/**
 * Registers /sw.js on mount. Renders nothing -- purely a side-effect
 * component. Mounted once in the root layout so it covers every route
 * (marketing landing + dashboard), which is required for Chrome/Android to
 * treat the site as installable.
 */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Installability is a nice-to-have, not a hard requirement -- a
      // registration failure (e.g. an unsupported browser) should never
      // surface to the user or block anything else on the page.
    });
  }, []);

  return null;
}
