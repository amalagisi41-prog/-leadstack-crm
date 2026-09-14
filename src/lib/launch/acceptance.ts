export type AcceptanceStatus = "passed" | "blocked" | "not_verified";

export interface AcceptanceCheck {
  id: string;
  label: string;
  status: AcceptanceStatus;
  detail: string;
}

export interface LaunchAcceptanceInput {
  idx: {
    connected: boolean;
    listingsSynced: number | null;
    lastSyncAt: string | null;
  };
  listingCreated: boolean;
  campaignGenerated: boolean;
  approved: boolean;
  scheduled: boolean;
  publishing: Record<
    string,
    { configured: boolean; publishable: boolean } | undefined
  >;
  requestedChannels: string[];
}

/**
 * Turns observed provider/workflow evidence into a launch checklist.
 * `not_verified` is intentionally distinct from `blocked`: missing evidence
 * cannot be treated as proof that an account is connected or working.
 */
export function evaluateLaunchAcceptance(
  input: LaunchAcceptanceInput
): { passed: boolean; checks: AcceptanceCheck[] } {
  const checks: AcceptanceCheck[] = [];
  const add = (check: AcceptanceCheck) => checks.push(check);

  if (!input.idx.connected) {
    add({
      id: "idx-connected",
      label: "SmartMLS/IDX feed authorized",
      status: "not_verified",
      detail: "No authorized IDX connection is evidenced for this workspace.",
    });
  } else if (input.idx.listingsSynced == null || !input.idx.lastSyncAt) {
    add({
      id: "idx-connected",
      label: "SmartMLS/IDX feed authorized",
      status: "blocked",
      detail: "The feed is marked connected, but sync evidence is incomplete.",
    });
  } else {
    add({
      id: "idx-connected",
      label: "SmartMLS/IDX feed authorized",
      status: "passed",
      detail: `${input.idx.listingsSynced} listing${input.idx.listingsSynced === 1 ? "" : "s"} observed at ${input.idx.lastSyncAt}.`,
    });
  }

  const workflowChecks: Array<[string, string, boolean, string, string]> = [
    ["listing-created", "Property workspace created", input.listingCreated, "A verified listing created the property workspace.", "Create or import a verified listing before continuing."],
    ["campaign-generated", "Campaign drafts generated", input.campaignGenerated, "Channel drafts were generated for the property.", "Generate the campaign drafts for the property."],
    ["campaign-approved", "Campaign approved", input.approved, "The operator approved the content before publishing.", "Review and approve at least one channel draft."],
    ["campaign-scheduled", "Campaign scheduled", input.scheduled, "The approved campaign has a calendar assignment.", "Assign a date and time to the approved campaign."],
  ];
  for (const [id, label, value, passedDetail, blockedDetail] of workflowChecks) {
    add({
      id,
      label,
      status: value ? "passed" : "blocked",
      detail: value ? passedDetail : blockedDetail,
    });
  }

  for (const channel of input.requestedChannels) {
    const state = input.publishing[channel];
    if (!state) {
      add({
        id: `publish-${channel}`,
        label: `${channel} publishing provider`,
        status: "not_verified",
        detail: "No provider status was returned, so publishing is not verified.",
      });
    } else if (!state.configured) {
      add({
        id: `publish-${channel}`,
        label: `${channel} publishing provider`,
        status: "not_verified",
        detail: "This channel is not connected. Drafts remain export-ready.",
      });
    } else if (!state.publishable) {
      add({
        id: `publish-${channel}`,
        label: `${channel} publishing provider`,
        status: "blocked",
        detail: "The account is configured, but a publish-capable status is not evidenced.",
      });
    } else {
      add({
        id: `publish-${channel}`,
        label: `${channel} publishing provider`,
        status: "passed",
        detail: "The provider reports a publish-capable connection.",
      });
    }
  }

  return {
    passed: checks.length > 0 && checks.every((check) => check.status === "passed"),
    checks,
  };
}
