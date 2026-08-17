import { describe, expect, it } from "vitest";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { checkFairHousing } from "@/lib/workflows/guardrails";
import { REALTOR_COMPONENT_REGISTRY } from "@/lib/website-studio/realtor-component-registry";
import {
  CAPABILITY_ORDER,
  resolveCapabilities,
  type CapabilityInputs,
} from "./capabilities";
import { SITE_TEMPLATES, getTemplate } from "./templates";
import { composeTemplateBrief, describeReadiness } from "./compose";

/**
 * What can and cannot be asserted about generated websites.
 *
 * Nothing here claims to test whether a design is good — no test can. What it
 * holds is the structural contract around the generation: that a template
 * never asks for a section the account cannot fill, that every block it names
 * is one we have actually reviewed, that its own copy is Fair Housing clean
 * before a model ever sees it, and that every "go fix this" link lands on a
 * real page.
 *
 * Those are the failures that ship silently. Bad prose gets noticed and
 * regenerated; an invented listings grid on a live site does not.
 */

const NOTHING_CONNECTED: CapabilityInputs = {
  profileCompleteness: 0,
  idxEnabled: false,
  idxConfigured: false,
  reviewCount: 0,
  webChatEnabled: false,
  aiAgentConfigured: false,
};

const EVERYTHING_CONNECTED: CapabilityInputs = {
  profileCompleteness: 90,
  idxEnabled: true,
  idxConfigured: true,
  reviewCount: 12,
  webChatEnabled: true,
  aiAgentConfigured: true,
};

/** Just enough to generate: profile filled, nothing else connected. */
const PROFILE_ONLY: CapabilityInputs = {
  ...NOTHING_CONNECTED,
  profileCompleteness: 75,
};

const SA_ROUTES_DIR = join(
  process.cwd(),
  "src/app/(dashboard)/sa/[subAccountId]"
);

function existingRoutes(dir = SA_ROUTES_DIR, prefix = ""): Set<string> {
  const found = new Set<string>();
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (entry === "page.tsx") {
      found.add(prefix || "/");
      continue;
    }
    if (statSync(full).isDirectory()) {
      for (const nested of existingRoutes(full, `${prefix}/${entry}`)) {
        found.add(nested);
      }
    }
  }
  return found;
}
const ROUTES = existingRoutes();

describe("the templates themselves", () => {
  it("finds the sub-account routes on disk", () => {
    // Guards the link test below: an empty set would make it vacuous.
    expect(ROUTES.size).toBeGreaterThan(20);
  });

  it("only builds blocks that have been through component review", () => {
    // realtor-component-registry.ts carries provenance, licence and
    // accessibility review per block. A template naming something outside it
    // would route generated output around that review entirely.
    const reviewed = new Set(REALTOR_COMPONENT_REGISTRY.map((c) => c.section));
    for (const template of SITE_TEMPLATES) {
      for (const section of template.produces) {
        expect(reviewed.has(section), `${template.id} → ${section}`).toBe(true);
      }
    }
  });

  it("keeps its own copy Fair Housing clean", () => {
    // The brief is real-estate advertising copy that gets sent to a model as
    // instructions. Screening generated output is not enough if the seed
    // itself carries steering language.
    for (const template of SITE_TEMPLATES) {
      for (const [field, text] of Object.entries({
        name: template.name,
        audience: template.audience,
        summary: template.summary,
        brief: template.brief,
      })) {
        const result = checkFairHousing(text);
        expect(
          result.matchedPhrases,
          `${template.id}.${field}`
        ).toEqual([]);
      }
    }
  });

  it("tells the model what not to invent", () => {
    // The specific liability for a new agent: fabricated production numbers.
    const brief = getTemplate("new-solo-agent")!.brief;
    expect(brief).toMatch(/do not invent/i);
    expect(brief).toMatch(/transaction|sales volume|years of experience/i);
  });

  it("declares a behaviour for every capability it requires", () => {
    for (const template of SITE_TEMPLATES) {
      for (const requirement of template.requires) {
        expect(CAPABILITY_ORDER).toContain(requirement.capability);
        // Omitting a section requires knowing which section to omit.
        if (requirement.whenMissing === "omit-section") {
          expect(requirement.section, template.id).toBeTruthy();
          expect(template.produces).toContain(requirement.section);
        }
      }
    }
  });
});

describe("resolving what this account actually has", () => {
  it("does not count an IDX add-on with no feed as listings", () => {
    // The trap: the gate is open, so the feature looks enabled, but there is
    // nothing to render. An empty listings grid is the dead region this whole
    // manifest exists to prevent.
    const caps = resolveCapabilities({
      ...PROFILE_ONLY,
      idxEnabled: true,
      idxConfigured: false,
    });
    expect(caps.idx.available).toBe(false);
    expect(caps.idx.detail).toMatch(/no feed/i);
  });

  it("does not count zero reviews as a reviews section", () => {
    expect(resolveCapabilities(PROFILE_ONLY).reviews.available).toBe(false);
  });

  it("treats a thin business profile as not ready", () => {
    expect(
      resolveCapabilities({ ...EVERYTHING_CONNECTED, profileCompleteness: 20 })
        .businessProfile.available
    ).toBe(false);
  });

  it("points every unmet capability at a real page with something to do", () => {
    const caps = resolveCapabilities(NOTHING_CONNECTED);
    for (const id of CAPABILITY_ORDER) {
      const cap = caps[id];
      expect(cap.available, id).toBe(false);
      expect(cap.detail.trim().length, id).toBeGreaterThan(20);
      expect(cap.action.trim().length, id).toBeGreaterThan(0);
      expect(ROUTES.has(cap.href), `${id} → ${cap.href}`).toBe(true);
    }
  });
});

describe("composing the brief", () => {
  const template = getTemplate("new-solo-agent")!;

  it("builds everything when everything is connected", () => {
    const brief = composeTemplateBrief(
      template,
      resolveCapabilities(EVERYTHING_CONNECTED)
    );
    expect(brief.blockedBy).toEqual([]);
    expect(brief.omitted).toEqual([]);
    expect(brief.included).toEqual([...template.produces]);
    expect(describeReadiness(brief)).toMatch(/everything this needs/i);
  });

  it("refuses to generate from an empty business profile", () => {
    // Generating anyway produces filler with the agent's name on it, which
    // they will publish, because it looks finished.
    const brief = composeTemplateBrief(
      template,
      resolveCapabilities(NOTHING_CONNECTED)
    );
    expect(brief.blockedBy.map((c) => c.id)).toEqual(["businessProfile"]);
    expect(brief.prompt).toBe("");
    expect(describeReadiness(brief)).toMatch(/needed first/i);
  });

  it("never asks for a section the account cannot fill", () => {
    // The core guarantee. A model told to build a listings section will build
    // one — with invented properties or empty cards — and removing it after
    // generation is too late, because the agent has already seen the page.
    const brief = composeTemplateBrief(
      template,
      resolveCapabilities(PROFILE_ONLY)
    );

    expect(brief.included).not.toContain("idx");
    expect(brief.included).not.toContain("testimonials");
    expect(brief.prompt).not.toMatch(/Build exactly these sections[^\n]*\bidx\b/);
    expect(brief.prompt).not.toMatch(
      /Build exactly these sections[^\n]*testimonials/
    );
  });

  it("forbids the omitted sections rather than staying silent about them", () => {
    // Silence is not enough: a helpful model fills a gap it notices.
    const brief = composeTemplateBrief(
      template,
      resolveCapabilities(PROFILE_ONLY)
    );
    expect(brief.prompt).toMatch(/Do not build, reference, or leave a placeholder for/);
    expect(brief.prompt).toMatch(/idx/);
    expect(brief.prompt).toMatch(/testimonials/);
    expect(brief.prompt).toMatch(/empty or invented/);
  });

  it("still builds the site when only optional extras are missing", () => {
    const brief = composeTemplateBrief(
      template,
      resolveCapabilities({ ...EVERYTHING_CONNECTED, webChatEnabled: false })
    );
    expect(brief.blockedBy).toEqual([]);
    expect(brief.degraded.map((c) => c.id)).toEqual(["webChat"]);
    expect(brief.included).toEqual([...template.produces]);
  });

  it("keeps the required blocks in every survivable state", () => {
    // Whatever is missing, a site without a header, hero or closing action is
    // not a site. These must never be droppable.
    const required = REALTOR_COMPONENT_REGISTRY.filter((c) => c.required).map(
      (c) => c.section
    );
    for (const inputs of [EVERYTHING_CONNECTED, PROFILE_ONLY]) {
      const brief = composeTemplateBrief(template, resolveCapabilities(inputs));
      for (const section of required) {
        if (!template.produces.includes(section)) continue;
        expect(brief.included, JSON.stringify(inputs)).toContain(section);
      }
    }
  });
});
