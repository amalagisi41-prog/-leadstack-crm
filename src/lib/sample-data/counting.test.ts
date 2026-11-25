import { describe, expect, it } from "vitest";
import { headlineCounts, realRecords, sampleCount } from "./counting";
import { buildReportsSummary } from "@/lib/reports/summary";
import type { Contact } from "@/types/contacts";
import type { Deal } from "@/types/deals";

/**
 * Every surface that shows a deal or contact count must agree, because they
 * all go through lib/sample-data/counting.ts:
 *   - Deals (pipeline) stat cards: realRecords(deals), open = not won/lost
 *   - Global search: lists every deal but labels samples; counted = non-sample
 *   - Settings export: realRecords(contacts/deals)
 *   - Dashboard: realRecords at subscription → newLeads / openDeals / empty
 *   - Reports: fetchReportsSummary → realRecords → buildReportsSummary
 */
const NOW = Date.now();
const recent = new Date(NOW - 60 * 60 * 1000);

function contact(id: string, isSample: boolean): Contact {
  return { id, name: id, email: `${id}@example.com`, createdAt: recent, isSample } as unknown as Contact;
}
function deal(id: string, stageId: string, isSample: boolean): Deal {
  return {
    id,
    title: id,
    contactId: id,
    stageId,
    value: 1000,
    currency: "USD",
    createdAt: recent,
    stageChangedAt: recent,
    isSample,
  } as unknown as Deal;
}

const STAGES = ["qualified", "contacted", "new", "proposal", "won"];

function workspace(isSample: boolean) {
  return {
    contacts: STAGES.map((_, i) => contact(`c${i}`, isSample)),
    deals: STAGES.map((s, i) => deal(`d${i}`, s, isSample)),
  };
}

function everySurface(contacts: Contact[], deals: Deal[]) {
  const dashboard = headlineCounts(contacts, deals, NOW);
  const pipelineCounted = realRecords(deals);
  const searchCounted = deals.filter((d) => !d.isSample);
  const exported = { contacts: realRecords(contacts).length, deals: realRecords(deals).length };
  const reports = buildReportsSummary({
    contacts: realRecords(contacts),
    deals: realRecords(deals),
    range: "all",
  });
  return {
    deals: {
      dashboard: dashboard.deals,
      pipeline: pipelineCounted.length,
      search: searchCounted.length,
      export: exported.deals,
      reports: reports.funnel.reduce((n, s) => n + s.count, 0),
    },
    openDeals: {
      dashboard: dashboard.openDeals,
      pipeline: pipelineCounted.filter((d) => d.stageId !== "won" && d.stageId !== "lost").length,
      reports: reports.kpis.openDeals,
    },
    contacts: {
      dashboard: dashboard.contacts,
      export: exported.contacts,
    },
    newLeads: { dashboard: dashboard.newLeads, reports: reports.kpis.newLeads },
    dashboardEmpty: dashboard.empty,
  };
}

const allEqual = (o: Record<string, number>, v: number) =>
  Object.values(o).forEach((n) => expect(n).toBe(v));

describe("one counting rule across surfaces", () => {
  it("sample-only workspace: every surface counts zero and the dashboard is empty", () => {
    const { contacts, deals } = workspace(true);
    const r = everySurface(contacts, deals);
    allEqual(r.deals, 0);
    allEqual(r.openDeals, 0);
    allEqual(r.contacts, 0);
    allEqual(r.newLeads, 0);
    expect(r.dashboardEmpty).toBe(true);
    // ...while the samples still exist for their lists to show under the banner.
    expect(sampleCount(contacts)).toBe(5);
    expect(sampleCount(deals)).toBe(5);
  });

  it("real-only workspace: every surface counts every record", () => {
    const { contacts, deals } = workspace(false);
    const r = everySurface(contacts, deals);
    allEqual(r.deals, 5);
    allEqual(r.openDeals, 4);
    allEqual(r.contacts, 5);
    allEqual(r.newLeads, 5);
    expect(r.dashboardEmpty).toBe(false);
  });

  it("mixed workspace: only the real records are counted", () => {
    const s = workspace(true);
    const real = { contacts: [contact("r1", false)], deals: [deal("r1", "new", false)] };
    const r = everySurface([...s.contacts, ...real.contacts], [...s.deals, ...real.deals]);
    allEqual(r.deals, 1);
    allEqual(r.contacts, 1);
    allEqual(r.newLeads, 1);
  });
});
