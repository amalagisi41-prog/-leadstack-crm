import { describe, expect, it } from "vitest";
import { inspectHostedSiteHtml } from "./dom-health";

describe("hosted website DOM health", () => {
  it("recognizes the shared responsive renderer contract", () => {
    const html = `<!doctype html><html><head><style>@media (max-width: 720px){}</style></head><body><div class="agent-site-root"><nav aria-label="Legal"></nav><img src="https://example.com/a.jpg"></div></body></html>`;
    const result = inspectHostedSiteHtml(html);
    expect(result.passed).toBe(true);
    expect(result.assetUrls).toEqual(["https://example.com/a.jpg"]);
  });

  it("fails an unrelated or incomplete page", () => {
    expect(inspectHostedSiteHtml("<html>login</html>").passed).toBe(false);
  });
});
