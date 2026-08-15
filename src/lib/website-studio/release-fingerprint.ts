import "server-only";

import { createHash } from "node:crypto";
import type {
  AgentSiteComposition,
  AgentSiteContent,
} from "@/types/agent-site";
import { normalizeAgentSiteComposition } from "./site-composition";

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, child]) => [key, stable(child)])
    );
  }
  return value;
}

export function releaseFingerprint(
  content: AgentSiteContent,
  composition?: AgentSiteComposition
) {
  return createHash("sha256")
    .update(
      JSON.stringify(
        stable({
          content,
          composition: normalizeAgentSiteComposition(composition),
        })
      )
    )
    .digest("hex");
}
