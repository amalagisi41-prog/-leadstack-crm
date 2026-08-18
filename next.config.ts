import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `deploymentId` was set here to a git commit sha, to stamp asset requests
  // with the build they belong to. That is the wrong value: skew protection
  // keys on the host's own deployment id, not on a commit sha, so the `?dpl=`
  // it appends names a deployment that does not exist. Removed rather than
  // corrected — switching skew protection on at the platform sets this option
  // itself, with the right value, and a hand-written one only fights it.
  images: {
    remotePatterns: [
      // Marketing-page placeholder property photos in the IDX Listings
      // device mockup (src/components/landing-custom/idx-showcase.tsx).
      // Real deployments should swap these for the operator's own
      // synced IDX Broker listing photos.
      { protocol: "https", hostname: "images.unsplash.com" },
    ],
  },
  async redirects() {
    return [
      {
        source: "/sa/:subAccountId/website-transfer-preview",
        destination: "/sa/:subAccountId/website-studio",
        permanent: false,
      },
    ];
  },
  async headers() {
    return [
      {
        // The web-chat embed iframe target — must be loadable cross-
        // origin from any buyer's site. CSP frame-ancestors '*' is the
        // explicit way to allow that; without it, some hosts (and the
        // Vercel default in certain configs) inject X-Frame-Options
        // DENY/SAMEORIGIN which would block third-party iframes.
        source: "/embed/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors *;",
          },
          // Suppress the legacy header in case anything upstream tries
          // to add it. (Vercel doesn't by default but belt-and-braces.)
          { key: "X-Frame-Options", value: "ALLOWALL" },
        ],
      },
      {
        // The service worker is the one file that must never be served stale.
        // It is what notices new versions, so a cached copy freezes every
        // installed app on whatever shipped when it was cached — and the app
        // would keep working, which is what makes it hard to notice.
        // Browsers bypass the HTTP cache for the top-level worker script by
        // default, but that default is a spec detail to rely on rather than a
        // guarantee from whichever CDN sits in front of this.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        // Same reasoning: the manifest carries the app's name, icons and
        // screenshots, and a stale one keeps a retired icon on home screens.
        source: "/manifest.webmanifest",
        headers: [
          { key: "Cache-Control", value: "no-cache, must-revalidate" },
        ],
      },
      {
        // Widget loader: long-cache and serve to any origin so the
        // <script> tag works on any buyer's site.
        source: "/widget.js",
        headers: [
          { key: "Cache-Control", value: "public, max-age=300, s-maxage=300" },
          { key: "Access-Control-Allow-Origin", value: "*" },
          {
            key: "Content-Type",
            value: "application/javascript; charset=utf-8",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
