import type { MetadataRoute } from "next";
import { CUSTOM_BRAND, LANDING_VARIANT } from "@/config/landing";

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
    name: `${name} — Real Estate CRM`,
    short_name: name,
    description:
      LANDING_VARIANT === "custom"
        ? CUSTOM_BRAND.shortDescription
        : "The operating system for modern real estate professionals.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#1D3D73",
    theme_color: "#1D3D73",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/icon-512-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
