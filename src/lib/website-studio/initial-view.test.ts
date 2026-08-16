import { describe, expect, it } from "vitest";
import {
  getInitialWebsiteStudioView,
  getWorkspaceWebsiteStudioView,
} from "./initial-view";

describe("website studio initial view", () => {
  it("opens templates for a new site before hosting is configured", () => {
    expect(
      getInitialWebsiteStudioView({
        foundationReady: false,
        hasTemplateSite: false,
      })
    ).toBe("builder");
  });

  it("opens an existing AgentStack draft in Vibe", () => {
    expect(
      getInitialWebsiteStudioView({
        foundationReady: true,
        hasTemplateSite: true,
      })
    ).toBe("vibe");
  });

  it("keeps the dedicated Vibe route authoritative", () => {
    expect(
      getWorkspaceWebsiteStudioView({
        workspace: "vibe",
        foundationReady: false,
        hasTemplateSite: false,
      })
    ).toBe("vibe");
  });
});
