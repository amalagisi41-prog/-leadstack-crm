import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, type NextResponse } from "next/server";
const auth = vi.hoisted(() => ({ mode: "invalid" as "invalid" | "error", called: vi.fn() }));
vi.mock("next-firebase-auth-edge/lib/next/middleware", () => ({
  authMiddleware: (_request: unknown, options: {
    handleInvalidToken: () => Promise<NextResponse>;
    handleError: () => Promise<NextResponse>;
  }) => {
    auth.called();
    return auth.mode === "error" ? options.handleError() : options.handleInvalidToken();
  },
}));
import middleware from "./middleware";
beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://agentstackcrm.app");
  // Exercise the configured-auth path, never the no-Firebase dev bypass.
  vi.stubEnv("NEXT_PUBLIC_FIREBASE_API_KEY", "test-api-key");
  vi.stubEnv("FIREBASE_ADMIN_PROJECT_ID", "test-project");
  auth.called.mockClear();
});
afterEach(() => vi.unstubAllEnvs());
for (const mode of ["invalid", "error"] as const) {
  describe(`public pricing with ${mode} auth`, () => {
    beforeEach(() => { auth.mode = mode; });
    for (const path of ["/pricing", "/pricing/", "/pricing?utm_source=search"]) {
      it(`allows a cookie-free request to ${path}`, async () => {
        const request = new NextRequest(`https://agentstackcrm.app${path}`, { headers: { host: "agentstackcrm.app" } });
        expect(request.headers.has("cookie")).toBe(false);
        const response = await middleware(request);
        expect(auth.called).toHaveBeenCalledOnce();
        expect(response.status).toBe(200);
        expect(response.headers.get("location")).toBeNull();
        expect(response.headers.get("x-middleware-next")).toBe("1");
      });
    }
    for (const path of ["/sa/test/dashboard", "/pricing-internal"]) {
      it(`keeps ${path} behind login`, async () => {
        const response = await middleware(new NextRequest(`https://agentstackcrm.app${path}`, { headers: { host: "agentstackcrm.app" } }));
        expect(response.status).toBe(307);
        const location = new URL(response.headers.get("location")!);
        expect(location.pathname).toBe("/login");
        expect(location.searchParams.get("redirect")).toBe(path);
      });
    }
  });
}
