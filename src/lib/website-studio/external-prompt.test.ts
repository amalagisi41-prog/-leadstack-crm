import { describe, expect, it } from "vitest";
import {
  countCssRules,
  extractExternalCode,
  looksLikeCss,
  mergeCustomCss,
  summarizeExternalCode,
  transcriptTextFor,
} from "./external-prompt";
import { applyDesignFields } from "./design";

/**
 * Cover for pasting design work produced in Claude or ChatGPT. The failure
 * these guard against is silent: CSS that looks accepted but was truncated,
 * paraphrased by the model, or dropped without explanation.
 */
describe("external design + code ingestion", () => {
  it("extracts a fenced css block and leaves the prose behind", () => {
    const message = [
      "Claude gave me this, can you apply it?",
      "```css",
      ".hero { letter-spacing: 2px; text-transform: uppercase; }",
      ".cta { border-radius: 999px; }",
      "```",
    ].join("\n");

    const extracted = extractExternalCode(message);

    expect(extracted.css).toContain("letter-spacing: 2px");
    expect(extracted.css).toContain(".cta");
    expect(extracted.hasCode).toBe(true);
    // The model sees a placeholder, never the bytes it must not reproduce.
    expect(extracted.prose).toContain("Claude gave me this");
    expect(extracted.prose).toContain("[css block applied verbatim: 2 rules]");
    expect(extracted.prose).not.toContain("letter-spacing");
  });

  it("applies a pasted stylesheet through the normal scoping validator", () => {
    const extracted = extractExternalCode("```css\nh1 { color: #112233 }\n```");
    const design = applyDesignFields(
      {},
      { customCss: extracted.css }
    );

    // Scoped, so a paste can never leak into the surrounding dashboard UI.
    expect(design.customCss).toContain("#agentstack-site-canvas h1");
  });

  it("reports rejected css instead of dropping it silently", () => {
    const extracted = extractExternalCode(
      '```css\n@import url("https://evil.example/x.css");\nh1 { color: red }\n```'
    );

    expect(extracted.css).toBe("");
    expect(extracted.rejectedCss).toContain("@import");
    expect(summarizeExternalCode(extracted)).toContain("REJECTED");
  });

  it("lifts design tokens out of a pasted json palette", () => {
    const extracted = extractExternalCode(
      'Here is the palette ChatGPT suggested:\n```json\n{ "accent": "#c9a227", "bg": "#0f172a", "radius": 12 }\n```'
    );

    expect(extracted.designTokens).toEqual({
      accent: "#c9a227",
      bg: "#0f172a",
      radius: 12,
    });
    expect(extracted.prose).toContain("design tokens applied");
  });

  it("keeps non-design json keys in the prose so they stay screened", () => {
    // Content fields must reach the model, which routes them through the
    // fair-housing screen — they must not bypass it as raw design tokens.
    const extracted = extractExternalCode(
      '```json\n{ "accent": "#111111", "tagline": "Great homes for great families" }\n```'
    );

    expect(extracted.designTokens).toEqual({ accent: "#111111" });
    expect(extracted.prose).toContain("tagline");
  });

  it("flags markup and scripts as unsupported rather than pretending", () => {
    const extracted = extractExternalCode(
      "```html\n<section class=\"hero\"><h1>Hi</h1></section>\n```"
    );

    expect(extracted.css).toBe("");
    expect(extracted.unsupported).toEqual([{ language: "html", lines: 1 }]);
    expect(summarizeExternalCode(extracted)).toContain("Do NOT claim");
  });

  it("treats preprocessor syntax as unsupported, not as css", () => {
    // Nested SCSS would emit garbage through the flat CSS scoper.
    const extracted = extractExternalCode(
      "```scss\n.hero { .title { color: red; } }\n```"
    );

    expect(extracted.css).toBe("");
    expect(extracted.unsupported[0].language).toBe("scss");
  });

  it("accepts a bare paste with no code fences at all", () => {
    const extracted = extractExternalCode(
      ".hero-title { font-size: 3rem; line-height: 1.1; }"
    );

    expect(extracted.css).toContain("font-size: 3rem");
    expect(extracted.prose).toBe("Apply this stylesheet to my site.");
  });

  it("does not mistake ordinary prose for css", () => {
    expect(looksLikeCss("Make the hero blue and the buttons rounded")).toBe(
      false
    );
    expect(extractExternalCode("Make the hero blue").hasCode).toBe(false);
    // An unbalanced fragment is not a stylesheet either.
    expect(looksLikeCss(".hero { color: red")).toBe(false);
  });

  it("sniffs an untagged fence for css or json", () => {
    const css = extractExternalCode("```\n.a { color: red }\n```");
    expect(css.css).toContain("color: red");

    const json = extractExternalCode('```\n{ "accent": "#abcdef" }\n```');
    expect(json.designTokens).toEqual({ accent: "#abcdef" });
  });

  it("appends rather than replaces so a second paste keeps the first", () => {
    expect(mergeCustomCss(".a{color:red}", ".b{color:blue}")).toBe(
      ".a{color:red}\n.b{color:blue}"
    );
    expect(mergeCustomCss("", ".b{color:blue}")).toBe(".b{color:blue}");
    expect(mergeCustomCss(".a{color:red}", "")).toBe(".a{color:red}");
    // Re-pasting the same block must not duplicate it.
    expect(mergeCustomCss(".a{color:red}", ".a{color:red}")).toBe(
      ".a{color:red}"
    );
  });

  it("re-scoping already-scoped css is idempotent", () => {
    const first = applyDesignFields({}, { customCss: "h1 { color: red }" });
    const second = applyDesignFields(first, {
      customCss: mergeCustomCss(first.customCss ?? "", "h2 { color: blue }"),
    });

    expect(second.customCss).toContain("#agentstack-site-canvas h1");
    expect(second.customCss).toContain("#agentstack-site-canvas h2");
    // Not double-prefixed.
    expect(second.customCss).not.toContain(
      "#agentstack-site-canvas #agentstack-site-canvas"
    );
  });

  it("stores a summary in the transcript, not the pasted bytes", () => {
    const big = `.x { color: red }\n`.repeat(400);
    const message = "Apply this\n```css\n" + big + "```";
    const extracted = extractExternalCode(message);

    const stored = transcriptTextFor(message, extracted);

    expect(stored.length).toBeLessThan(2100);
    expect(stored).toContain("Apply this");
    expect(stored).not.toContain(".x { color: red }");
  });

  it("counts rules ignoring comments", () => {
    expect(countCssRules("/* a { } */ .b { color: red }")).toBe(1);
  });
});
