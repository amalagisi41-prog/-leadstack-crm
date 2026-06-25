import type { MetadataRoute } from "next";

/**
 * robots.txt — Next.js picks this up automatically and serves at /robots.txt.
 *
 * Disallows the authenticated dashboard surfaces (/dashboard, /sa/...,
 * /agency/...) so they never show up in search results even if a logged-
 * in user accidentally shares a URL. Public marketing + docs + booking
 * + form + comparison pages are allowed.
 */
export default function robots(): MetadataRoute.Robots {
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ??
    "https://leadstack.dev";

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/dashboard",
          "/dashboard/",
          "/sa/",
          "/agency/",
          "/me/",
          "/affiliate/dashboard",
          "/affiliate/login",
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
