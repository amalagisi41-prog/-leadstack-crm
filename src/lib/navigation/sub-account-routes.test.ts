import { describe, expect, it } from "vitest";
import {
  LEGACY_SUB_ACCOUNT_ROUTES,
  SUB_ACCOUNT_ROUTES,
  subAccountHomeFromPath,
} from "./sub-account-routes";

/**
 * The 404 page reads the failed address to decide where "Back to my
 * workspace" goes. Getting that wrong is how a member who mistyped a URL
 * inside their own workspace ends up bounced out to the legacy flat route.
 */
describe("subAccountHomeFromPath", () => {
  it("sends a member back to the workspace they were already in", () => {
    expect(subAccountHomeFromPath("/sa/zNQOOXDtHJHRYSpGBbmA/contacts")).toBe(
      "/sa/zNQOOXDtHJHRYSpGBbmA/dashboard",
    );
  });

  it("handles the workspace root itself", () => {
    expect(subAccountHomeFromPath("/sa/sub-1")).toBe("/sa/sub-1/dashboard");
  });

  it("stops at the first segment rather than keeping the rest of the path", () => {
    expect(subAccountHomeFromPath("/sa/sub-1/quotes/q-2026-0001/edit")).toBe(
      "/sa/sub-1/dashboard",
    );
  });

  it("ignores a query string or hash on the failed address", () => {
    expect(subAccountHomeFromPath("/sa/sub-1?tab=messaging")).toBe(
      "/sa/sub-1/dashboard",
    );
    expect(subAccountHomeFromPath("/sa/sub-1#section")).toBe(
      "/sa/sub-1/dashboard",
    );
  });

  it("returns null for a path that names no workspace", () => {
    expect(subAccountHomeFromPath("/agency/sub-accounts")).toBeNull();
    expect(subAccountHomeFromPath("/contacts")).toBeNull();
    expect(subAccountHomeFromPath("/")).toBeNull();
    expect(subAccountHomeFromPath("")).toBeNull();
  });

  it("refuses a broken href interpolation instead of linking into it", () => {
    // `/sa/undefined/...` is what a missing id in a template literal
    // produces. Sending someone there from the 404 page would 404 again.
    expect(subAccountHomeFromPath("/sa/undefined/contacts")).toBeNull();
    expect(subAccountHomeFromPath("/sa/null/contacts")).toBeNull();
    expect(subAccountHomeFromPath("/sa/")).toBeNull();
  });

  it("builds on the canonical dashboard segment, not a hardcoded string", () => {
    expect(subAccountHomeFromPath("/sa/sub-1/x")).toBe(
      `/sa/sub-1${SUB_ACCOUNT_ROUTES.dashboard}`,
    );
  });
});

describe("route tables", () => {
  it("keeps the People and Deals destinations the sidebar links to", () => {
    // The sidebar's primary nav builds `/sa/{id}` + these segments; the
    // pages live at app/(dashboard)/sa/[subAccountId]/{contacts,pipeline}.
    expect(SUB_ACCOUNT_ROUTES.contacts).toBe("/contacts");
    expect(SUB_ACCOUNT_ROUTES.pipeline).toBe("/pipeline");
  });

  it("points every legacy redirect at a route that still exists", () => {
    const live = new Set<string>(Object.values(SUB_ACCOUNT_ROUTES));
    for (const [from, to] of Object.entries(LEGACY_SUB_ACCOUNT_ROUTES)) {
      expect(live.has(to), `${from} redirects to ${to}`).toBe(true);
    }
  });
});
