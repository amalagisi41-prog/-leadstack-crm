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

  it("canonicalizes the legacy Lead Capture route", () => {
    expect(
      sanitizeZackAction({
        type: "navigate",
        path: "/sa/demo/lead-capture",
        label: "Go to Lead Capture",
        description: "Open Lead Capture",
      }),
    ).toMatchObject({ path: "/sa/demo/forms" });
  });

  it("canonicalizes the legacy booking creation route", () => {
    expect(
      sanitizeZackAction({
        type: "navigate",
        path: "/sa/demo/booking/create",
        label: "Create booking page",
        description: "Open the booking editor.",
      }),
    ).toMatchObject({ path: "/sa/demo/booking/new" });
  });

  it("accepts only a safe Blueprint form-fill action", () => {
    expect(
      sanitizeZackAction({
        type: "populate_form_from_blueprint",
        formId: "Il5nfo7n3eYDmBjQAYUO",
        label: "Fill from Blueprint",
        description: "Fill safe form hints from the approved Blueprint.",
      }),
    ).toMatchObject({
      type: "populate_form_from_blueprint",
      formId: "Il5nfo7n3eYDmBjQAYUO",
    });
    expect(
      sanitizeZackAction({
        type: "populate_form_from_blueprint",
        formId: "../../danger",
        label: "Fill",
        description: "Bad path",
      }),
    ).toBeNull();
  });
});
