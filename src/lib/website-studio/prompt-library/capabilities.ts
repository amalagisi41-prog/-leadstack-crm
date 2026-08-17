import type { AgentSiteSectionType } from "@/types/agent-site";

/**
 * What a generated site can actually be built out of, for this account.
 *
 * The failure this exists to prevent: a starting prompt that promises live
 * listings, embedded reviews, and an AI agent trained on the business produces
 * a beautiful page with three dead regions when none of those are connected.
 * That is worse than a blank page — the agent paid for the generation, the
 * page looks finished, and the holes are only discovered by a visitor.
 *
 * So a template declares what it needs, this resolves what is actually there,
 * and the composer only asks for sections that can be filled. A capability is
 * "available" when the data behind it exists, not when the feature is merely
 * switched on: an IDX add-on with no feed configured builds an empty listings
 * grid just as surely as no add-on at all.
 */

export type CapabilityId =
  | "businessProfile"
  | "idx"
  | "reviews"
  | "webChat"
  | "aiAgent";

export interface CapabilityState {
  id: CapabilityId;
  available: boolean;
  /** Shown in the readiness list, in the agent's language. */
  label: string;
  /** What is missing and what it costs them — empty when available. */
  detail: string;
  /** Where to go and fix it. Sub-account-relative. */
  href: string;
  /** The button on that row. */
  action: string;
}

export interface CapabilityInputs {
  /** 0–100. Below the template threshold there is nothing to write from. */
  profileCompleteness: number;
  /** The agency add-on gate. */
  idxEnabled: boolean;
  /** A feed actually configured — an enabled add-on with no feed builds nothing. */
  idxConfigured: boolean;
  /** Collected reviews available to embed. */
  reviewCount: number;
  webChatEnabled: boolean;
  /** An assistant configured to answer visitor questions. */
  aiAgentConfigured: boolean;
}

export const CAPABILITY_ORDER: readonly CapabilityId[] = [
  "businessProfile",
  "idx",
  "reviews",
  "webChat",
  "aiAgent",
];

export function resolveCapabilities(
  inputs: CapabilityInputs
): Record<CapabilityId, CapabilityState> {
  const idx = inputs.idxEnabled && inputs.idxConfigured;
  return {
    businessProfile: {
      id: "businessProfile",
      available: inputs.profileCompleteness >= 60,
      label: "Your business details",
      detail:
        "We write your site from your business profile. With very little in it there is nothing specific to say, and the result reads like a template.",
      href: "/business-profile",
      action: "Fill this in",
    },
    idx: {
      id: "idx",
      available: idx,
      label: "Live listings feed",
      detail: inputs.idxEnabled
        ? "IDX is on but no feed is connected yet, so there are no listings to show."
        : "IDX is not enabled on this account, so live listings cannot appear on the site.",
      href: "/idx",
      action: inputs.idxEnabled ? "Connect a feed" : "See IDX",
    },
    reviews: {
      id: "reviews",
      available: inputs.reviewCount > 0,
      label: "Client reviews",
      detail:
        "No reviews collected yet. A reviews section with nothing in it reads worse than no section at all.",
      href: "/contacts",
      action: "Request reviews",
    },
    webChat: {
      id: "webChat",
      available: inputs.webChatEnabled,
      label: "Chat widget",
      detail:
        "Web chat is off, so visitors will have no way to start a conversation from the site.",
      href: "/connect",
      action: "Turn on chat",
    },
    aiAgent: {
      id: "aiAgent",
      available: inputs.aiAgentConfigured,
      label: "AI answering visitor questions",
      detail:
        "No assistant is set up to answer visitor questions about your business.",
      href: "/ai-agents",
      action: "Set one up",
    },
  };
}

/**
 * What a template does when a capability it wanted is not there.
 *
 * `block` is reserved for the case where generating anyway produces something
 * actively bad rather than merely smaller — a site written with no business
 * details is generic filler with the agent's name on it, and shipping that is
 * worse than telling them to spend two minutes on their profile first.
 */
export type MissingBehaviour = "omit-section" | "degrade" | "block";

export interface TemplateRequirement {
  capability: CapabilityId;
  whenMissing: MissingBehaviour;
  /** The block this capability powers, when it powers one. */
  section?: AgentSiteSectionType;
}
