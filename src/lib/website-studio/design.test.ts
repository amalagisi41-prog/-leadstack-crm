import { describe, expect, it } from "vitest";
import { applyDesignFields, scopeCustomCss, SITE_CANVAS_ID } from "./design";

describe("website studio design tokens", () => {
  it("accepts safe hex and rgb colors, rejects garbage", () => {
    const next = applyDesignFields(
      {},
      { accent: "#c8a35b", bg: "rgb(10, 20, 30)", text: "url(javascript:alert(1))" }
    );
    expect(next.accent).toBe("#c8a35b");
    expect(next.bg).toBe("rgb(10, 20, 30)");
    expect(next.text).toBeUndefined();
  });

  it("clamps radius into range and rejects non-numbers", () => {
    expect(applyDesignFields({}, { radius: 999 }).radius).toBe(48);
    expect(applyDesignFields({}, { radius: -5 }).radius).toBe(0);
    expect(applyDesignFields({}, { radius: "12" }).radius).toBeUndefined();
  });

  it("only accepts known hero variants", () => {
    expect(applyDesignFields({}, { heroVariant: "split" }).heroVariant).toBe(
      "split"
    );
    expect(
      applyDesignFields({}, { heroVariant: "javascript:alert(1)" }).heroVariant
    ).toBeUndefined();
  });

  it("sanitizes font values to a safe charset", () => {
    expect(applyDesignFields({}, { fontDisplay: "Georgia, serif" }).fontDisplay).toBe(
      "Georgia, serif"
    );
    expect(
      applyDesignFields({}, { fontBody: "Arial; } body { display:none" }).fontBody
    ).toBeUndefined();
  });

  it("preserves existing fields when merging a partial update", () => {
    const current = { accent: "#111111", radius: 10 };
    const next = applyDesignFields(current, { accent: "#222222" });
    expect(next.accent).toBe("#222222");
    expect(next.radius).toBe(10);
  });
});

describe("custom CSS scoping", () => {
  it("scopes a plain selector under the site canvas", () => {
    const out = scopeCustomCss("h1 { letter-spacing: 2px; }");
    expect(out).toBe(`#${SITE_CANVAS_ID} h1{ letter-spacing: 2px; }`);
  });

  it("maps body and :root onto the canvas root itself", () => {
    expect(scopeCustomCss("body { background: blue; }")).toBe(
      `#${SITE_CANVAS_ID}{ background: blue; }`
    );
    expect(scopeCustomCss(":root { --x: 1; }")).toBe(
      `#${SITE_CANVAS_ID}{ --x: 1; }`
    );
  });

  it("does not double-scope a selector already inside the canvas", () => {
    const scoped = `#${SITE_CANVAS_ID} .hero`;
    expect(scopeCustomCss(`${scoped} { color: red; }`)).toBe(
      `${scoped}{ color: red; }`
    );
  });

  it("recurses into @media blocks", () => {
    const out = scopeCustomCss("@media (max-width: 600px) { .hero { font-size: 20px; } }");
    expect(out).toBe(
      `@media (max-width: 600px){#${SITE_CANVAS_ID} .hero{ font-size: 20px; }}`
    );
  });

  it("passes @font-face and @keyframes bodies through untouched", () => {
    const css =
      "@keyframes fade { from { opacity: 0; } to { opacity: 1; } } .x { animation: fade 1s; }";
    const out = scopeCustomCss(css);
    expect(out).toContain("@keyframes fade{ from { opacity: 0; } to { opacity: 1; } }");
    expect(out).toContain(`#${SITE_CANVAS_ID} .x{ animation: fade 1s; }`);
  });

  it("drops @import statements", () => {
    const out = scopeCustomCss('@import url("https://evil.example/x.css"); .x { color: red; }');
    expect(out).not.toContain("@import");
    expect(out).toContain(`#${SITE_CANVAS_ID} .x`);
  });

  it("strips comments before scoping", () => {
    const out = scopeCustomCss("/* note */ .x { color: red; } /* trailing */");
    expect(out).toBe(`#${SITE_CANVAS_ID} .x{ color: red; }`);
  });

  it("rejects the whole block via applyDesignFields when dangerous patterns are present", () => {
    const next = applyDesignFields(
      {},
      { customCss: ".x { color: red; } body { behavior: url(evil.htc); }" }
    );
    expect(next.customCss).toBe("");
  });

  it("rejects an oversized customCss payload entirely", () => {
    const huge = "a".repeat(20_001);
    const next = applyDesignFields({}, { customCss: huge });
    expect(next.customCss).toBeUndefined();
  });

  it("accepts and scopes a normal customCss payload via applyDesignFields", () => {
    const next = applyDesignFields({}, { customCss: ".cta { transform: scale(1.05); }" });
    expect(next.customCss).toBe(`#${SITE_CANVAS_ID} .cta{ transform: scale(1.05); }`);
  });
});
