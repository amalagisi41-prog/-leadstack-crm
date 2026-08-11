import { describe, expect, it } from "vitest";
import { sanitizeZackAction } from "./actions";

describe("sanitizeZackAction", () => {
  it("accepts an allowlisted setting change", () => {
    expect(
      sanitizeZackAction({
        type: "set_daily_briefing",
        enabled: true,
        label: "Turn on briefing",
        description: "Send the workspace owner a daily briefing email.",
      }),
    ).toEqual({
      type: "set_daily_briefing",
      enabled: true,
      label: "Turn on briefing",
      description: "Send the workspace owner a daily briefing email.",
    });
  });

  it("rejects arbitrary endpoints and unsupported actions", () => {
    expect(
      sanitizeZackAction({
        type: "delete_workspace",
        endpoint: "/api/dev-only/danger-wipe-everything",
        label: "Delete",
        description: "Delete the workspace.",
      }),
    ).toBeNull();
  });

  it("rejects external navigation", () => {
    expect(
      sanitizeZackAction({
        type: "navigate",
        path: "https://example.com",
        label: "Open",
        description: "Open an external page.",
      }),
    ).toBeNull();
  });
});
