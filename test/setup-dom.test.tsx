import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

/** Proves the jsdom project, JSX transform, and matchers are all wired up. */
describe("component test harness", () => {
  it("renders JSX and exposes jest-dom matchers", () => {
    render(<p>Website Studio</p>);
    expect(screen.getByText("Website Studio")).toBeInTheDocument();
  });

  it("provides the browser APIs jsdom omits", () => {
    expect(typeof window.matchMedia).toBe("function");
    expect(typeof window.ResizeObserver).toBe("function");
    expect(typeof Element.prototype.scrollIntoView).toBe("function");
  });
});
