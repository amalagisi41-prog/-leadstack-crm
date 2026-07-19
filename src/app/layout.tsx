import type { Metadata, Viewport } from "next";
import { Providers } from "@/components/providers";
import { RefTracker } from "@/components/affiliate/ref-tracker";
import { AnalyticsScripts } from "@/components/analytics-scripts";
import { CUSTOM_BRAND, LANDING_VARIANT } from "@/config/landing";
import "./globals.css";

// Metadata follows the same variant the landing page renders. The custom
// variant derives title + description from CUSTOM_BRAND so the buyer edits
// one config file to brand both the page chrome and the rendered landing.
const CUSTOM_SITE_URL = `https://${CUSTOM_BRAND.primaryDomain}`;
const AGENTSTACK_SITE_URL = "https://agentstackcrm.app";
const CUSTOM_TITLE = `${CUSTOM_BRAND.name} — ${CUSTOM_BRAND.tagline}`;
const AGENTSTACK_TITLE =
  "AgentStack — The all-in-one CRM for teams that actually close";
const AGENTSTACK_DESCRIPTION =
  "Capture leads, run pipelines, and book meetings from one simple workspace. Built for small teams that want to replace five tools with one.";
const APP_ICONS: Metadata["icons"] = {
  icon: [
    { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
  ],
  apple: [
    {
      url: "/icons/apple-touch-icon.png",
      sizes: "180x180",
      type: "image/png",
    },
  ],
};

export const metadata: Metadata =
  LANDING_VARIANT === "custom"
    ? {
        metadataBase: new URL(CUSTOM_SITE_URL),
        alternates: { canonical: "/" },
        title: CUSTOM_TITLE,
        description: CUSTOM_BRAND.shortDescription,
        icons: APP_ICONS,
        openGraph: {
          title: CUSTOM_TITLE,
          description: CUSTOM_BRAND.shortDescription,
          url: CUSTOM_SITE_URL,
          siteName: CUSTOM_BRAND.name,
          type: "website",
        },
        twitter: {
          card: "summary_large_image",
          title: CUSTOM_TITLE,
          description: CUSTOM_BRAND.shortDescription,
        },
      }
    : {
        metadataBase: new URL(AGENTSTACK_SITE_URL),
        alternates: { canonical: "/" },
        title: AGENTSTACK_TITLE,
        description: AGENTSTACK_DESCRIPTION,
        icons: APP_ICONS,
        openGraph: {
          title: AGENTSTACK_TITLE,
          description: AGENTSTACK_DESCRIPTION,
          url: AGENTSTACK_SITE_URL,
          siteName: "AgentStack",
          type: "website",
        },
        twitter: {
          card: "summary_large_image",
          title: AGENTSTACK_TITLE,
          description: AGENTSTACK_DESCRIPTION,
        },
      };

// viewport-fit=cover lets the installed PWA draw under the iOS notch/home
// indicator; paired with the safe-area-inset-* CSS vars in globals.css so
// fixed dashboard chrome (sidebar, header, floating buttons) pads around
// them instead of being obscured.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">
        {process.env.NEXT_PUBLIC_GTM_ID && (
          <noscript>
            <iframe
              src={`https://www.googletagmanager.com/ns.html?id=${process.env.NEXT_PUBLIC_GTM_ID}`}
              height="0"
              width="0"
              style={{ display: "none", visibility: "hidden" }}
            />
          </noscript>
        )}
        <Providers>{children}</Providers>
        <RefTracker />
        {process.env.NEXT_PUBLIC_META_PIXEL_ID && (
          <noscript>
            {/* Meta Pixel no-JS fallback — must be a bare <img> tag.
                next/image requires client JS and can't run inside <noscript>,
                which is the entire reason this fallback exists. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              height="1"
              width="1"
              style={{ display: "none" }}
              alt=""
              src={`https://www.facebook.com/tr?id=${process.env.NEXT_PUBLIC_META_PIXEL_ID}&ev=PageView&noscript=1`}
            />
          </noscript>
        )}
        <AnalyticsScripts />
      </body>
    </html>
  );
}
