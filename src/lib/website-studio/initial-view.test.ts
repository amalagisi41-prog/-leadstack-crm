import { describe, expect, it } from "vitest";
import {
  getInitialWebsiteStudioView,
  hasImportedExactSite,
} from "./initial-view";
import type { WebsiteTransferDoc } from "@/types/website-transfer";

function transfer(
  overrides: Partial<WebsiteTransferDoc> = {}
): WebsiteTransferDoc {
  return {
    id: "transfer-1",
    snapshotVersion: 2,
    sourceUrl: "https://example.com",
    status: "approved",
    stage: 5,
    pages: [
      {
        url: "https://example.com/",
        path: "/",
        title: "Home",
        description: "",
        status: "copied",
        httpStatus: 200,
        imageCount: 1,
        formCount: 0,
        scriptCount: 0,
        notes: [],
        snapshotHtml: "<html><body>Exact site</body></html>",
      },
    ],
    inventory: {
      pages: 1,
      navigationLinks: [],
      images: [],
      fonts: [],
      colors: [],
      stylesheets: [],
      scripts: [],
      forms: 0,
      tracking: [],
      redirects: [],
      cms: null,
      hosting: null,
      dnsProvider: null,
    },
    error: null,
    privatePreviewPath: "/preview",
    approvedAt: "2026-08-14T00:00:00.000Z",
    hostingStatus: "requested",
    hostingRequestedAt: "2026-08-14T00:01:00.000Z",
    hostingUrl: null,
    createdAt: "2026-08-14T00:00:00.000Z",
    updatedAt: "2026-08-14T00:01:00.000Z",
    ...overrides,
  };
}

describe("website studio initial view", () => {
  it("opens the imported exact site even after hosting is requested", () => {
    const imported = transfer();
    expect(hasImportedExactSite(imported)).toBe(true);
    expect(
      getInitialWebsiteStudioView({
        foundationReady: true,
        transfer: imported,
        hasTemplateSite: true,
      })
    ).toBe("exact");
  });

  it("does not replace an imported site with a template draft", () => {
    expect(
      getInitialWebsiteStudioView({
        foundationReady: true,
        transfer: transfer({ hostingStatus: "ready" }),
        hasTemplateSite: true,
      })
    ).toBe("exact");
  });

  it("falls back to the vibe builder only when there is no exact capture", () => {
    expect(
      getInitialWebsiteStudioView({
        foundationReady: true,
        transfer: null,
        hasTemplateSite: true,
      })
    ).toBe("vibe");
  });
});
