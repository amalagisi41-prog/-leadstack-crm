import type { ContactAttribution } from "@/types/contacts";

/**
 * Reads marketing attribution from the current page's URL params + document
 * referrer. Used by the hosted form page (/f/[id]) to forward attribution
 * data with the submission so the contact carries its source.
 *
 * Note for iframe embeds: this reads the IFRAME'S URL, not the host page's.
 * If the agency embeds the form via iframe and wants host-page attribution
 * to flow through, they must encode the UTMs in the iframe src — e.g.
 * `<iframe src="/f/abc123?utm_source=meta&utm_campaign=spring"></iframe>`.
 * Cross-origin iframes can't read window.parent.location.
 */
export function readAttributionFromBrowser(): ContactAttribution | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const pick = (key: string): string | null => {
    const v = params.get(key);
    return v && v.trim().length > 0 ? v.trim().slice(0, 500) : null;
  };

  const referrer =
    document.referrer && document.referrer.length > 0
      ? document.referrer.slice(0, 500)
      : null;
  const landingPage = window.location.href.slice(0, 500);

  const utmSource = pick("utm_source");
  const utmMedium = pick("utm_medium");
  const utmCampaign = pick("utm_campaign");
  const utmContent = pick("utm_content");
  const utmTerm = pick("utm_term");
  const fbclid = pick("fbclid");
  const gclid = pick("gclid");

  const hasAnyTracking =
    utmSource ||
    utmMedium ||
    utmCampaign ||
    utmContent ||
    utmTerm ||
    fbclid ||
    gclid ||
    referrer;

  if (!hasAnyTracking) return null;

  return {
    utmSource,
    utmMedium,
    utmCampaign,
    utmContent,
    utmTerm,
    fbclid,
    gclid,
    landingPage,
    referrer,
  };
}

type FbqArgs =
  | [event: "init", pixelId: string]
  | [event: "track", eventName: string, params?: Record<string, unknown>];

interface FbqFn {
  (...args: FbqArgs): void;
  callMethod?: (...args: unknown[]) => unknown;
  queue?: unknown[];
}

declare global {
  interface Window {
    fbq?: FbqFn;
  }
}

/**
 * Fires Meta Pixel `Lead` event. No-op when the pixel isn't loaded
 * (NEXT_PUBLIC_META_PIXEL_ID unset). Safe to call from any client component.
 */
export function trackLeadEvent(params?: {
  email?: string;
  phone?: string;
  utmCampaign?: string | null;
}) {
  if (typeof window === "undefined" || typeof window.fbq !== "function") {
    return;
  }
  try {
    window.fbq("track", "Lead", {
      content_name: params?.utmCampaign ?? undefined,
    });
  } catch {
    // Pixel errors should never break form submission UX.
  }
}
