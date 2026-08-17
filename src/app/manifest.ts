import type { MetadataRoute } from "next";
import { CUSTOM_BRAND, LANDING_VARIANT } from "@/config/landing";
import { versionedIcon } from "@/lib/pwa/icon-version";

/**
 * Next.js App Router manifest route -- serves /manifest.webmanifest and
 * auto-injects the <link rel="manifest"> tag. This is what makes the
 * dashboard installable ("Add to Home Screen") on Android/Chrome and iOS
 * Safari. Name/short_name follow CUSTOM_BRAND on the white-label variant so
 * every buyer's installed icon is labeled with their own brand, not
 * "AgentStack".
 */
export default function manifest(): MetadataRoute.Manifest {
  const name = LANDING_VARIANT === "custom" ? CUSTOM_BRAND.name : "AgentStack";

  return {
    // Pinned explicitly. Without `id` the app's identity is derived from
    // start_url, so changing start_url later would read as a different app and
    // orphan every existing install rather than updating it.
    id: "/?source=pwa",
    name: `${name} — Real Estate Operating System`,
    short_name: name,
    description:
      LANDING_VARIANT === "custom"
        ? CUSTOM_BRAND.shortDescription
        : "The operating system for modern real estate professionals.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    categories: ["business", "productivity"],
    // Android paints background_color behind the icon on the launch splash.
    // It has to be the navy: the icon is a cream tile, and on a cream splash
    // the tile's edge disappears into the background entirely.
    background_color: "#173B7A",
    theme_color: "#173B7A",
    icons: [
      { src: versionedIcon("/icons/icon-192.png"), sizes: "192x192", type: "image/png" },
      { src: versionedIcon("/icons/icon-512.png"), sizes: "512x512", type: "image/png" },
      {
        src: versionedIcon("/icons/icon-512-maskable.png"),
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    // Chrome on Android only shows the rich install dialog — icon, name,
    // description and these images — when the manifest carries screenshots
    // with at least one `form_factor: "narrow"`. Without them the user gets a
    // bare mini-infobar, which reads like a browser prompt rather than
    // installing an app. Captured from the live site, not mocked up.
    screenshots: [
      {
        src: "/screenshots/phone-1-overview.png",
        sizes: "540x960",
        type: "image/png",
        form_factor: "narrow",
        label: "Capture leads and respond instantly",
      },
      {
        src: "/screenshots/phone-2-in-use.png",
        sizes: "540x960",
        type: "image/png",
        form_factor: "narrow",
        label: "See every deal exactly where it stands",
      },
      {
        src: "/screenshots/phone-3-workflow.png",
        sizes: "540x960",
        type: "image/png",
        form_factor: "narrow",
        label: "Route leads by territory automatically",
      },
    ],
    // No `shortcuts`. Every screen worth deep-linking to — People, Tasks,
    // Conversations — lives under /sa/[subAccountId]/, and the manifest is a
    // single static document with no way to know which workspace this user
    // belongs to. Pointing several entries at /dashboard would just repeat the
    // same destination under different names.
  };
}
