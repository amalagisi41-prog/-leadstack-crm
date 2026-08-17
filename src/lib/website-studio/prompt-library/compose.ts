import type { AgentSiteSectionType } from "@/types/agent-site";
import type { CapabilityId, CapabilityState } from "./capabilities";
import type { SiteTemplate } from "./templates";

/**
 * Turn a template plus this account's real capabilities into a brief Zack can
 * run — or a clear reason it cannot run yet.
 *
 * The single guarantee worth stating: **the composed brief never asks for a
 * section that cannot be filled.** Everything else here is presentation. If a
 * template wants a listings grid and no feed is connected, the words "listings"
 * do not reach the model, because a model told to build a listings section will
 * build one, with invented properties or empty cards. Removing it afterwards is
 * too late; the page has already been generated and the agent has already seen
 * it.
 */

export interface OmittedSection {
  section: AgentSiteSectionType;
  capability: CapabilityId;
  /** Why it is not being built, in the agent's language. */
  reason: string;
}

export interface ComposedBrief {
  /** Non-empty means generation must not run. */
  blockedBy: CapabilityState[];
  /** The brief, or "" when blocked. */
  prompt: string;
  included: AgentSiteSectionType[];
  omitted: OmittedSection[];
  /** Capabilities that reduce the result without removing a section. */
  degraded: CapabilityState[];
}

export function composeTemplateBrief(
  template: SiteTemplate,
  capabilities: Record<CapabilityId, CapabilityState>
): ComposedBrief {
  const blockedBy: CapabilityState[] = [];
  const omitted: OmittedSection[] = [];
  const degraded: CapabilityState[] = [];
  const dropped = new Set<AgentSiteSectionType>();

  for (const requirement of template.requires) {
    const state = capabilities[requirement.capability];
    if (!state || state.available) continue;

    switch (requirement.whenMissing) {
      case "block":
        blockedBy.push(state);
        break;
      case "omit-section":
        if (requirement.section) {
          dropped.add(requirement.section);
          omitted.push({
            section: requirement.section,
            capability: state.id,
            reason: state.detail,
          });
        }
        break;
      case "degrade":
        degraded.push(state);
        break;
    }
  }

  const included = template.produces.filter((s) => !dropped.has(s));

  if (blockedBy.length > 0) {
    return { blockedBy, prompt: "", included: [], omitted, degraded };
  }

  return {
    blockedBy: [],
    prompt: buildPrompt(template, included, omitted),
    included,
    omitted,
    degraded,
  };
}

function buildPrompt(
  template: SiteTemplate,
  included: AgentSiteSectionType[],
  omitted: OmittedSection[]
): string {
  const parts = [template.brief.trim()];

  parts.push(
    `\nBuild exactly these sections and no others: ${included.join(", ")}.`
  );

  if (omitted.length > 0) {
    // Naming the omissions as forbidden, rather than staying silent about
    // them, is deliberate. A brief that merely omits "listings" still invites
    // a helpful model to add a listings grid it cannot fill.
    const names = omitted.map((o) => o.section).join(", ");
    parts.push(
      `Do not build, reference, or leave a placeholder for: ${names}. ` +
        `The data behind ${omitted.length === 1 ? "it is" : "them are"} not connected on this account, ` +
        `so anything built there would be empty or invented.`
    );
  }

  return parts.join("\n");
}

/** One-line summary for the picker card, before anything is generated. */
export function describeReadiness(brief: ComposedBrief): string {
  if (brief.blockedBy.length > 0) {
    return brief.blockedBy.map((c) => c.label).join(" and ") + " needed first";
  }
  if (brief.omitted.length === 0 && brief.degraded.length === 0) {
    return "Everything this needs is connected";
  }
  const missing = [
    ...brief.omitted.map((o) => o.section),
    ...brief.degraded.map((d) => d.label.toLowerCase()),
  ];
  return `Builds without ${missing.join(", ")}`;
}
