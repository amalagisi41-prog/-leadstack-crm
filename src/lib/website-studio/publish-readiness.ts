import type { AgentSiteContent } from "@/types/agent-site";

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

export function assessAgentSitePublishReadiness(
  content: AgentSiteContent
): PublishReadinessIssue[] {
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

  const compliance = content.compliance;
  if (!isHttpsUrl(compliance?.privacyPolicyUrl)) {
    blocker("privacyPolicyUrl", "Add a secure Privacy Policy URL.");
  }
  if (!isHttpsUrl(compliance?.termsUrl)) {
    blocker("termsUrl", "Add a secure Terms of Service URL.");
  }
  if (!compliance?.fairHousingStatement.trim()) {
    blocker("fairHousingStatement", "Add the fair-housing statement.");
  }
  if (!compliance?.licenseNumber.trim() || !compliance.licenseStates.trim()) {
    warning(
      "license",
      "Confirm the license number and licensed state(s) before advertising regulated services."
    );
  }
  if (
    compliance?.smsConsentEnabled &&
    !compliance.smsConsentDisclosure.trim()
  ) {
    blocker("smsConsentDisclosure", "Add SMS consent and STOP disclosures.");
  }
  return issues;
}

export function hasPublishBlockers(issues: PublishReadinessIssue[]) {
  return issues.some((issue) => issue.severity === "blocker");
}
