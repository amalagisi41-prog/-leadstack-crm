import { describe, expect, it } from "vitest";
import {
  getInitialWebsiteStudioView,
  getWorkspaceWebsiteStudioView,
} from "./initial-view";

describe("website studio initial view", () => {
  it("routes to setup until the domain/hosting foundation is confirmed", () => {
    expect(
      getInitialWebsiteStudioView({
        foundationReady: false,
        hasTemplateSite: false,
      })
    ).toBe("setup");
  });

  it("opens the vibe workspace once a site draft exists", () => {
    expect(
      getInitialWebsiteStudioView({
        foundationReady: true,
        hasTemplateSite: true,
      })
    ).toBe("vibe");
  });

  it("opens the builder when no site draft exists yet", () => {
    expect(
      getInitialWebsiteStudioView({
        foundationReady: true,
        hasTemplateSite: false,
      })
    ).toBe("builder");
  });

  it("keeps the dedicated vibe route authoritative while setup loads", () => {
    expect(
      getWorkspaceWebsiteStudioView({
        workspace: "vibe",
        foundationReady: false,
        hasTemplateSite: false,
      })
    ).toBe("vibe");
  });

  it("never routes through a baseline-approval view", () => {
    expect(
      getWorkspaceWebsiteStudioView({
        workspace: "home",
        foundationReady: true,
        hasTemplateSite: true,
      })
    ).toBe("vibe");
  });
});
