import { describe, expect, it } from "vitest";
import {
  computeCanvasBox,
  computePreviewScale,
  describePreview,
  getPreviewDevice,
  PREVIEW_DEVICES,
} from "./preview-viewport";

describe("preview device presets", () => {
  it("exposes the canonical device widths", () => {
    expect(PREVIEW_DEVICES.map((d) => d.width)).toEqual([
      1440, 1280, 768, 390, 375,
    ]);
  });

  it("falls back to desktop for an unknown id", () => {
    expect(getPreviewDevice("nope").id).toBe("desktop");
    expect(getPreviewDevice("mobile").width).toBe(390);
  });
});

describe("preview scale", () => {
  it("fits a wide document into a narrow panel", () => {
    expect(
      computePreviewScale({ containerWidth: 720, deviceWidth: 1440, zoom: "fit" })
    ).toBe(0.5);
  });

  it("never scales up past 100% when fitting", () => {
    // A 390px mobile document in a 1200px panel must stay at 1:1 — blowing it
    // up would misrepresent how the site actually looks on a phone.
    expect(
      computePreviewScale({ containerWidth: 1200, deviceWidth: 390, zoom: "fit" })
    ).toBe(1);
  });

  it("honors an explicit zoom regardless of container width", () => {
    expect(
      computePreviewScale({ containerWidth: 300, deviceWidth: 1440, zoom: 0.75 })
    ).toBe(0.75);
  });

  it("degrades safely on a zero or unmeasured container", () => {
    expect(
      computePreviewScale({ containerWidth: 0, deviceWidth: 1440, zoom: "fit" })
    ).toBe(1);
    expect(
      computePreviewScale({ containerWidth: NaN, deviceWidth: 1440, zoom: "fit" })
    ).toBe(1);
  });
});

describe("canvas box compensation", () => {
  it("claims the scaled size, not the unscaled size", () => {
    // This is the regression the old preview had: a 4000px document scaled to
    // 0.5 still reserved 4000px of layout height, leaving a dead scroll region.
    expect(
      computeCanvasBox({ deviceWidth: 1440, contentHeight: 4000, scale: 0.5 })
    ).toEqual({ width: 720, height: 2000 });
  });

  it("is a no-op at 100%", () => {
    expect(
      computeCanvasBox({ deviceWidth: 390, contentHeight: 1200, scale: 1 })
    ).toEqual({ width: 390, height: 1200 });
  });

  it("handles an unmeasured content height", () => {
    expect(
      computeCanvasBox({ deviceWidth: 1440, contentHeight: 0, scale: 0.5 })
    ).toEqual({ width: 720, height: 0 });
  });

  it("guards against a zero scale", () => {
    expect(
      computeCanvasBox({ deviceWidth: 1440, contentHeight: 1000, scale: 0 })
    ).toEqual({ width: 1440, height: 1000 });
  });
});

describe("preview label", () => {
  it("names the device, its true viewport, and the zoom", () => {
    expect(describePreview(getPreviewDevice("mobile"), 0.75)).toBe(
      "Mobile · 390 × 844 · 75%"
    );
  });
});
