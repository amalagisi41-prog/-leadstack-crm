import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { authMiddleware } from "next-firebase-auth-edge/lib/next/middleware";

const PUBLIC_PATHS = [
  "/",
  "/login",
  "/signup",
  "/terms",
  "/privacy",
  "/about",
  "/thank-you",
  // Public docs (e.g. /docs/updating — the "keeping your app up to date"
  // guide linked from /thank-you and shareable as a stable URL).
  "/docs",
  "/f",
  "/api/forms",
  "/api/auth/signup",
  // Workflow Builder step worker — QStash callback, signature-verified inside
  // the route.
  "/api/workflows/step",
  "/api/broadcasts/email/step",
  "/api/checkout",
  "/api/cron/gitpage-heartbeat",
  // Daily sweep for the public API's TTL'd collections (apiRequestLogs,
  // apiIdempotency, webhookEvents). Replaces native Firestore TTL so the
  // buyer doesn't need to click into the Firebase console — QStash is
  // already part of their onboarding. Signature-verified inside the route.
  "/api/cron/api-cleanup",
  "/api/landing/metrics",
  "/api/landing/recent-purchases",
  // Live-visitors heartbeat ping for the agency dashboard's world map.
  // Public POST from every landing-page browser every ~5s. Validation
  // + best-effort failure handling inside the route — never breaks
  // the landing experience.
  "/api/landing/heartbeat",
  "/api/webhooks/twilio",
  "/api/webhooks/stripe",
  // Meta (Facebook Messenger + Instagram DM) webhook — BETA. Public from the
  // Meta cloud: GET is the verify-token handshake, POST carries message events.
  // Security: X-Hub-Signature-256 (HMAC of the raw body with the app secret)
  // verified inside the route; per-sub-account routing by Page / IG id.
  "/api/webhooks/meta",
  // Post-payment GitHub-invite endpoint. Public POST from the buyer's
  // browser on the /thank-you page. Security: 256-bit claim token in
  // the request body must hash-match the value stored on
  // purchases/{sessionId} by the Stripe webhook; 3-attempt permanent
  // lock per session on top.
  "/api/github",
  // Vapi voice-agent webhooks — public from the Vapi cloud. Security:
  //   - Authorization: Bearer ${VAPI_WEBHOOK_SECRET} header check inside
  //     each route (custom header configured per-assistant in the Vapi
  //     dashboard / via our provisioning code).
  //   - Routes scoped by [subAccountId] path param so a leaked secret
  //     can only impersonate one sub-account at worst.
  "/api/webhooks/vapi",
  // Web Chat widget — public from-the-browser API. Security:
  //  - Origin header validated against per-sub-account allowedDomains
  //  - In-memory per-IP + per-session rate limits
  //  - Anonymous sessions; identity only captured via [[capture …]] marker
  "/api/web-chat",
  // Embed pages — the chat widget iframe target. Public; the bot
  // can't send messages without passing the /api/web-chat/* origin check.
  "/embed",
  // Widget loader JS — public static file served from /public.
  "/widget.js",
  "/u",
  "/api/u",
  // Public quote pages — recipient-facing /q/[token] view (server-rendered)
  // and the accept/decline endpoint. Both gated by HMAC-signed token
  // verification inside the route; no session needed.
  "/q",
  "/api/quotes",
  // Public booking pages — /b/[saId]/[slug] hosted slot picker, plus the
  // availability + book POST endpoints. Security:
  //  - Page reads only return slots when `status === "published"`
  //  - Per-IP rate limit on availability + book POSTs
  //  - Server-side transactional re-verify at book time so a stale
  //    visitor can't double-book a slot
  "/b",
  "/api/booking",
  // Public event-management page (/e/[token]) + cancel/reschedule
  // endpoints. All gated by HMAC-token + hash match against the stored
  // `event.publicTokenHash`. Reschedule rotates the token so any
  // previously-mailed link invalidates cleanly.
  "/e",
  // Booking reminder + payment-auto-expire QStash callbacks. Security:
  // Upstash-Signature header verification inside the route.
  "/api/events/reminder",
  "/api/events/payment",
  "/api/dev-only/danger-wipe-everything",
  "/setup.html",
  // SEO conventions — Next.js serves these as virtual routes from
  // src/app/robots.ts and src/app/sitemap.ts respectively. Both must
  // reach crawlers unauthenticated.
  "/robots.txt",
  "/sitemap.xml",
  // Affiliate program — own session model (magic-link HMAC cookie), not
  // Firebase Auth. Auth checks happen inside each route/page.
  "/affiliate",
  "/api/affiliate",
  // Community + Courses (Skool-style) member surface — own session model
  // (magic-link HMAC cookie scoped to the sub-account), NOT Firebase Auth.
  // The agency gate + member-session checks happen inside each route/page;
  // a member session can never resolve into the staff `/sa/*` surface.
  "/c",
  "/api/community",
  // Public REST API (v1+). Auth happens INSIDE each route via Bearer-token
  // verification (lib/api/auth.ts), not via session cookie. Sub-account-
  // scoped keys; tenancy enforced in code (Admin SDK writes bypass
  // Firestore rules). Adding the prefix here means the Firebase-edge
  // middleware doesn't try to redirect API-key callers to /login.
  "/api/v1",
  // Outbound-webhook delivery worker. QStash callback only — signature-
  // verified inside the route via `verifyQStashSignature`. Mirrors the
  // existing /api/broadcasts/email/step + /api/workflows/step paths.
  "/api/webhooks-out",
];

/**
 * Dynamic public paths — patterns that contain a path param. These are
 * QStash-callback / webhook endpoints whose security comes from signature
 * verification inside the route, not from session auth.
 */
const PUBLIC_PATH_PATTERNS: RegExp[] = [
  // Bulk outbound-call step — QStash callback, signature-verified inside
  // the route (same security model as /api/broadcasts/email/step).
  /^\/api\/comms\/voice\/campaign\/step$/,
  // 3-day post-purchase Gitpage bonus reminder — QStash callback,
  // signature-verified inside the route.
  /^\/api\/gitpage-reminder\/step$/,
  // gitpage build poll: /api/sub-accounts/{id}/website/{siteId}/poll
  /^\/api\/sub-accounts\/[^/]+\/website\/[^/]+\/poll$/,
  // Social Planner publish callback — QStash callback, signature-verified
  // inside the route (same security model as /api/workflows/step).
  /^\/api\/social\/publish\/step$/,
  // GHL migration drain — QStash callback, signature-verified in the route.
  /^\/api\/import\/ghl\/step$/,
  // WhatsApp template approval poll: /api/sub-accounts/{id}/whatsapp-templates/poll
  // QStash callback, signature-verified inside the route.
  /^\/api\/sub-accounts\/[^/]+\/whatsapp-templates\/poll$/,
  // Calendar subscription feed: /api/sub-accounts/{id}/calendar.ics
  // Token-gated inside the route via verifyCalendarFeedToken — Google /
  // Apple / Outlook pollers are unauthenticated, so session-cookie auth
  // would block them. The HMAC token in `?t=` is the credential.
  /^\/api\/sub-accounts\/[^/]+\/calendar\.ics$/,
  // Public competitor comparison pages (SEO landing pages, e.g.
  // /leadstack-vs-gohighlevel). Slug is path-suffixed with a hyphen
  // rather than a slash so the PUBLIC_PATHS prefix-match logic can't
  // see it — regex is the only option here. Read-only public content;
  // no auth required. Each competitor has its own static route under
  // src/app/leadstack-vs-{slug}/page.tsx; this regex catches them all.
  /^\/leadstack-vs-[a-z0-9-]+$/,
];

function isPublicPath(pathname: string): boolean {
  if (
    PUBLIC_PATHS.some(
      (path) => pathname === path || pathname.startsWith(`${path}/`),
    )
  ) {
    return true;
  }
  return PUBLIC_PATH_PATTERNS.some((re) => re.test(pathname));
}

export default function middleware(request: NextRequest) {
  // Skip auth middleware if Firebase is not configured
  if (
    !process.env.NEXT_PUBLIC_FIREBASE_API_KEY ||
    !process.env.FIREBASE_ADMIN_PROJECT_ID
  ) {
    return NextResponse.next();
  }

  return authMiddleware(request, {
    loginPath: "/api/login",
    logoutPath: "/api/logout",
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    cookieName: "__session",
    cookieSignatureKeys: [
      process.env.COOKIE_SECRET_CURRENT ?? "",
      process.env.COOKIE_SECRET_PREVIOUS ?? "",
    ],
    cookieSerializeOptions: {
      path: "/",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 12 * 60 * 60 * 24, // 12 days
    },
    serviceAccount: {
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID ?? "",
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL ?? "",
      privateKey: (process.env.FIREBASE_ADMIN_PRIVATE_KEY ?? "").replace(
        /\\n/g,
        "\n",
      ),
    },
    handleValidToken: async ({ decodedToken }, headers) => {
      // Allow authenticated users through
      // Attach user info to headers for downstream use
      headers.set("x-user-uid", decodedToken.uid);
      headers.set("x-user-email", decodedToken.email ?? "");

      return NextResponse.next({ request: { headers } });
    },
    handleInvalidToken: async () => {
      const pathname = request.nextUrl.pathname;

      // Allow public paths without authentication
      if (isPublicPath(pathname)) {
        return NextResponse.next();
      }

      // Redirect unauthenticated users to login for protected paths
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("redirect", pathname);
      return NextResponse.redirect(url);
    },
    handleError: async () => {
      const pathname = request.nextUrl.pathname;

      // On error, allow public paths and redirect protected paths
      if (isPublicPath(pathname)) {
        return NextResponse.next();
      }

      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("redirect", pathname);
      return NextResponse.redirect(url);
    },
  });
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
    "/api/login",
    "/api/logout",
  ],
};
