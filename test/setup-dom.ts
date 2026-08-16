import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

/**
 * Shared jsdom setup for component tests.
 *
 * Unmounts between tests so a component that subscribes to something on mount
 * cannot leak into the next test, and fills in the browser APIs jsdom does
 * not implement but the dashboard components call on render.
 */

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// jsdom has no layout engine, so these are absent rather than merely inert.
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

if (!window.ResizeObserver) {
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof window.ResizeObserver;
}

if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function scrollIntoView() {};
}

if (!Element.prototype.scrollTo) {
  Element.prototype.scrollTo = function scrollTo() {};
}

// Components schedule focus/scroll work in rAF; jsdom provides it, but the
// timing is unhelpfully async for assertions, so run callbacks immediately.
window.requestAnimationFrame = ((cb: FrameRequestCallback) => {
  cb(0);
  return 0;
}) as typeof window.requestAnimationFrame;
window.cancelAnimationFrame = (() => {}) as typeof window.cancelAnimationFrame;
