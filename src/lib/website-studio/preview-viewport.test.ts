import { describe, expect, it } from "vitest";
import {
  calculatePreviewScale,
  calculateScaledPreviewHeight,
} from "./preview-viewport";

describe("website preview viewport", () => {
  it("scales a desktop viewport to the available width", () => {
    expect(calculatePreviewScale(640, "desktop")).toBe(0.5);
  });

  it("does not enlarge a mobile viewport past its real width", () => {
    expect(calculatePreviewScale(800, "mobile")).toBe(1);
  });

  it("compensates the wrapper for transformed content height", () => {
    expect(calculateScaledPreviewHeight(1533, 0.5)).toBe(767);
  });
});
