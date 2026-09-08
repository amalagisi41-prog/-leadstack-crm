import { describe, expect, it } from "vitest";
import { blockedCampaignChannels } from "@/lib/marketing/campaign-route-helpers";
import type { ContentBrief } from "@/types/marketing-campaigns";

const base = { channel: "facebook" as const, body: "facts", status: "ready" as const, approval: "operator" as const, reversibility: "recallable" as const, screens: ["no-invented-facts" as const], findings: [] };
const brief = { channels: [base, { ...base, channel: "sms" as const, status: "needs-review" as const, findings: ["must sell"] }] } as ContentBrief;

describe("campaign approval blocking", () => {
  it("blocks findings and non-ready drafts", () => {
    const blocked = blockedCampaignChannels(brief, ["facebook", "sms"]);
    expect(blocked.map((item) => item.channel)).toEqual(["sms"]);
    expect(blocked[0].findings).toEqual(["must sell"]);
  });
});
