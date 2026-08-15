import { describe, expect, it } from "vitest";
import {
  normalizeCapturedStylesheetLinks,
  removeCapturedStyleText,
} from "./styles";

describe("website transfer stylesheet safety", () => {
  it("makes captured stylesheet links absolute for isolated previews", () => {
    const html =
      '<head><link rel="stylesheet" crossorigin="anonymous" integrity="sha256-test" nonce="stale" href="/assets/site.css"></head>';
    const normalized = normalizeCapturedStylesheetLinks(
      html,
      ["https://www.example.com/assets/site.css"],
      new URL("https://www.example.com/")
    );

    expect(normalized).toContain(
      'href="https://www.example.com/assets/site.css"'
    );
    expect(normalized).not.toContain("crossorigin");
    expect(normalized).not.toContain("integrity");
    expect(normalized).not.toContain("nonce");
  });

  it("removes leaked IDX custom CSS text without removing the widget shell", () => {
    const html =
      '<idx-listings-carousel><div>/* IDX Carousel Widget */ body{color:red}</div></idx-listings-carousel>';
    const cleaned = removeCapturedStyleText(html);

    expect(cleaned).toBe("<idx-listings-carousel><div></div></idx-listings-carousel>");
  });

  it("does not remove an IDX comment from captured stylesheet CSS", () => {
    const html =
      '<head><style>/* IDX Carousel Widget */ idx-listings-carousel{display:block}</style></head>' +
      '<idx-listings-carousel><div>/* IDX Carousel Widget */ body{color:red}</div></idx-listings-carousel>';
    const cleaned = removeCapturedStyleText(html);

    expect(cleaned).toContain("/* IDX Carousel Widget */ idx-listings-carousel{display:block}");
    expect(cleaned).toContain("<idx-listings-carousel><div></div></idx-listings-carousel>");
  });

  it("removes a leaked IDX block when the source closes a generic wrapper", () => {
    const html =
      '<div class="widget">/* IDX Carousel Widget 167021 */ *{overflow:visible!important}</div><main>Hero</main>';
    expect(removeCapturedStyleText(html)).toBe(
      '<div class="widget"></div><main>Hero</main>'
    );
  });
});
