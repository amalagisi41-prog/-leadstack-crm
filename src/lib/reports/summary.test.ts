import { describe, expect, it } from "vitest";
import { buildReportsSummary } from "./summary";
import type { Deal } from "@/types/deals";
import type { Contact } from "@/types/contacts";

const now = new Date();
const daysAgo = (n: number) => new Date(now.getTime() - n * 24 * 60 * 60 * 1000);

function deal(overrides: Record<string, unknown>): Deal {
  return {
    id: "d1",
    subAccountId: "sa1",
    agencyId: "a1",
    createdByUid: "u1",
    contactId: "c1",
    title: "Test deal",
    value: 0,
    currency: "USD",
    stageId: "new",
    createdAt: now,
    updatedAt: now,
    stageChangedAt: now,
    ...overrides,
  } as unknown as Deal;
}

function contact(overrides: Record<string, unknown>): Contact {
  return {
    id: "c1",
    subAccountId: "sa1",
    agencyId: "a1",
    createdByUid: "u1",
    name: "Test contact",
    source: "website",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as unknown as Contact;
}

describe("buildReportsSummary", () => {
  it("computes KPIs within the selected range and excludes older records", () => {
    const deals = [
      deal({ id: "won-in-range", stageId: "won", value: 1000, createdAt: daysAgo(5), stageChangedAt: daysAgo(5) }),
      deal({ id: "won-out-of-range", stageId: "won", value: 5000, createdAt: daysAgo(40), stageChangedAt: daysAgo(40) }),
      deal({ id: "lost-in-range", stageId: "lost", createdAt: daysAgo(2) }),
      deal({ id: "open-in-range", stageId: "contacted", value: 200, createdAt: daysAgo(1) }),
    ];
    const contacts = [
      contact({ id: "c-in-range", createdAt: daysAgo(3) }),
      contact({ id: "c-out-of-range", createdAt: daysAgo(40) }),
    ];

    const summary = buildReportsSummary({ deals, contacts, range: "30d" });

    expect(summary.kpis.newLeads).toBe(1);
    expect(summary.kpis.wonDeals).toBe(1);
    expect(summary.kpis.wonValue).toBe(1000);
    expect(summary.kpis.lostDeals).toBe(1);
    expect(summary.kpis.openDeals).toBe(1);
    expect(summary.kpis.openValue).toBe(200);
    expect(summary.kpis.avgDealValue).toBe(1000);
    expect(summary.kpis.winRatePct).toBe(50); // 1 won / (1 won + 1 lost)
  });

  it("the funnel is a right-now snapshot across ALL deals, not range-filtered", () => {
    const deals = [
      deal({ id: "old-won", stageId: "won", value: 9999, createdAt: daysAgo(400) }),
    ];
    const summary = buildReportsSummary({ deals, contacts: [], range: "7d" });
    const won = summary.funnel.find((f) => f.stageId === "won");
    expect(won?.count).toBe(1);
    expect(won?.value).toBe(9999);
  });

  it("'all' range includes everything regardless of age", () => {
    const deals = [deal({ stageId: "won", value: 100, createdAt: daysAgo(900) })];
    const contacts = [contact({ createdAt: daysAgo(900) })];
    const summary = buildReportsSummary({ deals, contacts, range: "all" });
    expect(summary.kpis.newLeads).toBe(1);
    expect(summary.kpis.wonValue).toBe(100);
    expect(summary.rangeDays).toBeNull();
  });

  it("reports 0% win rate and no average when nothing has closed yet", () => {
    const deals = [deal({ stageId: "contacted" })];
    const summary = buildReportsSummary({ deals, contacts: [], range: "30d" });
    expect(summary.kpis.winRatePct).toBe(0);
    expect(summary.kpis.avgDealValue).toBe(0);
  });

  it("buckets won revenue and new leads into one entry per day across the range", () => {
    const summary = buildReportsSummary({ deals: [], contacts: [], range: "7d" });
    expect(summary.wonRevenueTimeline).toHaveLength(7);
    expect(summary.newLeadsTimeline).toHaveLength(7);
    expect(summary.wonRevenueTimeline.every((b) => b.value === 0)).toBe(true);
  });

  it("groups leads by source, falling back to 'other' when blank, sorted descending", () => {
    const contacts = [
      contact({ id: "c1", source: "referral" as Contact["source"] }),
      contact({ id: "c2", source: "referral" as Contact["source"] }),
      contact({ id: "c3", source: "" as Contact["source"] }),
    ];
    const summary = buildReportsSummary({ deals: [], contacts, range: "30d" });
    expect(summary.leadsBySource[0]).toEqual({ source: "referral", count: 2 });
    expect(summary.leadsBySource.find((s) => s.source === "other")?.count).toBe(1);
  });

  it("falls back to USD when no deal carries a currency yet", () => {
    const summary = buildReportsSummary({ deals: [], contacts: [], range: "30d" });
    expect(summary.currency).toBe("USD");
  });
});
