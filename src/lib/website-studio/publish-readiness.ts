import {
  normalizeAgentSiteContent,
  type AgentSiteContent,
} from "@/types/agent-site";

export type PublishReadinessIssue = {
  field: string;
  message: string;
  severity: "blocker" | "warning";
};

const isHttpsUrl = (value: string | undefined) => {
  if (!value) return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
};

/**
 * Assess a draft against the publish requirements.
 *
 * Input is normalized first, for two reasons. It makes the function total —
 * it is called from both the browser and the publish route, and a legacy
 * document with a partial `compliance` object used to throw here
 * (`compliance?.fairHousingStatement.trim()` guards the object but not the
 * field). It also keeps the two callers in agreement: the client evaluates
 * normalized state, so a server reading the raw document would otherwise
 * report different blockers and 409 a publish the UI had already cleared.
 */
export function assessAgentSitePublishReadiness(
  stored: Partial<AgentSiteContent> | null | undefined
): PublishReadinessIssue[] {
  const content = normalizeAgentSiteContent(stored);
  const issues: PublishReadinessIssue[] = [];
  const blocker = (field: string, message: string) =>
    issues.push({ field, message, severity: "blocker" });
  const warning = (field: string, message: string) =>
    issues.push({ field, message, severity: "warning" });

  if (!content.agentName.trim())
    blocker("agentName", "Add the agent or team name.");
  if (!content.brokerage.trim())
    blocker("brokerage", "Add the brokerage name.");
  if (!content.phone.trim() && !content.email.trim()) {
    blocker(
      "contact",
      "Add at least one public phone number or email address."
    );
  }
  if (!content.serviceAreas.trim())
    blocker("serviceAreas", "Add the service area.");

  const compliance = content.compliance!;
  if (!isHttpsUrl(compliance.privacyPolicyUrl)) {
    blocker("privacyPolicyUrl", "Add a secure Privacy Policy URL.");
  }
  if (!isHttpsUrl(compliance.termsUrl)) {
    blocker("termsUrl", "Add a secure Terms of Service URL.");
  }
  if (!compliance.fairHousingStatement.trim()) {
    blocker("fairHousingStatement", "Add the fair-housing statement.");
  }
  if (!compliance.licenseNumber.trim() || !compliance.licenseStates.trim()) {
    warning(
      "license",
      "Confirm the license number and licensed state(s) before advertising regulated services."
    );
  }
  if (
    compliance.smsConsentEnabled &&
    !compliance.smsConsentDisclosure.trim()
  ) {
    blocker("smsConsentDisclosure", "Add SMS consent and STOP disclosures.");
  }
  return issues;
}

export function hasPublishBlockers(issues: PublishReadinessIssue[]) {
  return issues.some((issue) => issue.severity === "blocker");
}
