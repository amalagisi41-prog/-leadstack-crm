import type { CapabilityId } from "@/lib/website-studio/prompt-library/capabilities";

/**
 * What Zack is allowed to do, and what each thing costs if it goes wrong.
 *
 * The existing `sanitizeZackAction` allowlist covers four settings toggles.
 * That shape does not survive contact with real work: creating a campaign
 * writes content, spends the operator's reach, and puts words out under a
 * licensed agent's name. Those need more than a type check — they need to
 * declare, in one reviewable place, whether a human must approve them, whether
 * they can be undone, and which compliance screens their output must clear.
 *
 * Modelled on `realtor-component-registry.ts` for the same reason: a registry
 * that carries review metadata is auditable, and anything not in it simply
 * cannot run. A tool added without an approval decision fails the test suite
 * rather than shipping with a default.
 */

/** Who has to say yes before this runs. */
export type ApprovalLevel =
  /** Reversible, internal, affects nobody outside the workspace. */
  | "none"
  /** The operator reviews a preview and confirms. */
  | "operator"
  /** Confirmation plus an explicit typed acknowledgement of what goes public. */
  | "operator-explicit";

/** What it takes to undo. */
export type Reversibility =
  /** One click, no trace left. */
  | "instant"
  /** Undoable, but something already left the building (a scheduled post). */
  | "recallable"
  /** Cannot be taken back — it reached a person or the public. */
  | "permanent";

/** Screens the tool's output must pass before it can be approved. */
export type ComplianceScreen =
  | "fair-housing"
  | "seller-position"
  | "mls-attribution"
  | "no-invented-facts"
  | "send-guardrails";

export interface ZackTool {
  id: string;
  label: string;
  /** One line, in the operator's language, for the plan preview. */
  summary: string;
  /** Capabilities that must resolve available before this can be planned. */
  requires: readonly CapabilityId[];
  approval: ApprovalLevel;
  reversibility: Reversibility;
  screens: readonly ComplianceScreen[];
  /** Whether the result reaches anyone outside the workspace. */
  outbound: boolean;
  /** Recorded on every run, so there is an answer to "who approved this". */
  audited: true;
}

const TOOLS: readonly ZackTool[] = [
  {
    id: "listing.boost.plan",
    label: "Plan a listing re-promotion",
    summary:
      "Builds channel-ready posts for a listing that has been on the market 30, 60, or 90 days.",
    requires: ["businessProfile", "idx"],
    // Drafting is safe. It produces a preview and nothing else.
    approval: "none",
    reversibility: "instant",
    screens: ["fair-housing", "seller-position", "mls-attribution", "no-invented-facts"],
    outbound: false,
    audited: true,
  },
  {
    id: "listing.boost.schedule",
    label: "Schedule the re-promotion",
    summary:
      "Queues the approved posts to the connected channels at the chosen times.",
    requires: ["businessProfile", "idx"],
    // It publishes under the agent's name and their licence is attached to it.
    approval: "operator-explicit",
    reversibility: "recallable",
    screens: ["fair-housing", "seller-position", "mls-attribution", "no-invented-facts"],
    outbound: true,
    audited: true,
  },
  {
    id: "campaign.followup.draft",
    label: "Draft a lead follow-up sequence",
    summary:
      "Writes a follow-up sequence for a lead segment, for review before anything sends.",
    requires: ["businessProfile"],
    approval: "none",
    reversibility: "instant",
    screens: ["fair-housing", "no-invented-facts"],
    outbound: false,
    audited: true,
  },
  {
    id: "campaign.followup.activate",
    label: "Turn on a follow-up sequence",
    summary: "Starts sending the approved sequence to the selected segment.",
    requires: ["businessProfile"],
    approval: "operator-explicit",
    // Once a message reaches a person it cannot be recalled.
    reversibility: "permanent",
    screens: ["fair-housing", "no-invented-facts", "send-guardrails"],
    outbound: true,
    audited: true,
  },
];

export const ZACK_TOOL_REGISTRY = TOOLS;

export function getTool(id: string): ZackTool | null {
  return TOOLS.find((t) => t.id === id) ?? null;
}

export interface ToolGateResult {
  /** The tool may be planned. */
  allowed: boolean;
  /** Capabilities that are missing. */
  missing: CapabilityId[];
  /** Whether a human must confirm before execution. */
  needsApproval: boolean;
  reason: string;
}

/**
 * Decide whether a tool can run for an account, before any model is involved.
 *
 * Fails closed on an unknown id: a tool that is not in the registry has not
 * been through an approval or compliance decision, and running it because the
 * model asked nicely is the whole failure this registry prevents.
 */
export function gateTool(
  toolId: string,
  available: Record<CapabilityId, boolean>
): ToolGateResult {
  const tool = getTool(toolId);
  if (!tool) {
    return {
      allowed: false,
      missing: [],
      needsApproval: true,
      reason: `"${toolId}" is not a capability Zack has. Nothing was run.`,
    };
  }

  const missing = tool.requires.filter((c) => !available[c]);
  if (missing.length > 0) {
    return {
      allowed: false,
      missing,
      needsApproval: tool.approval !== "none",
      reason: `This needs ${missing.join(" and ")} connected first.`,
    };
  }

  return {
    allowed: true,
    missing: [],
    needsApproval: tool.approval !== "none",
    reason: "",
  };
}

/** Anything that leaves the workspace requires a human, without exception. */
export function requiresHumanApproval(tool: ZackTool): boolean {
  return tool.outbound || tool.approval !== "none";
}
