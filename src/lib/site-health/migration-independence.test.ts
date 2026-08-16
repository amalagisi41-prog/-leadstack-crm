import { describe, expect, it } from "vitest";
import {
  assessCancellationReadiness,
  buildMigrationIndependenceTasks,
  type MigrationIndependenceInputs,
} from "./migration-independence";
import { computeSiteHealth, type SiteHealthInputs } from "./tasks";

/**
 * 100% has to mean "you can cancel GoHighLevel". These tests hold that line:
 * every dependency on the old platform blocks the score, and nothing is
 * assumed to be fine merely because it could not be checked.
 */

const NOT_READY: MigrationIndependenceInputs = {
  migratedFrom: "gohighlevel",
  migratedFromLabel: "GoHighLevel",
  siteVerifiedLive: false,
  siteConfirmedOffPlatform: false,
  siteServedByLabel: null,
  ownsPhoneNumber: false,
  ownsEmailDomain: false,
  contactsImported: false,
  automationsRebuilt: false,
  acks: {},
};

const ack = (at = "2026-08-16T12:00:00Z") => ({
  acknowledgedByUid: "uid-1",
  acknowledgedAt: at,
});

const READY: MigrationIndependenceInputs = {
  ...NOT_READY,
  siteVerifiedLive: true,
  siteConfirmedOffPlatform: true,
  siteServedByLabel: "Hostinger",
  ownsPhoneNumber: true,
  ownsEmailDomain: true,
  contactsImported: true,
  automationsRebuilt: true,
  acks: {
    conversations_saved: ack(),
    backup_exported: ack(),
  },
};

describe("the cancellation checklist", () => {
  it("is empty for an agent who did not migrate from anywhere", () => {
    // A brand-new agent has no old subscription and must not be held below
    // 100% by questions that cannot apply to them.
    const fresh = { ...NOT_READY, migratedFrom: null, migratedFromLabel: null };
    expect(buildMigrationIndependenceTasks(fresh)).toEqual([]);
    expect(assessCancellationReadiness(fresh).ready).toBe(false);
  });

  it("covers every way an account can still depend on the old platform", () => {
    expect(buildMigrationIndependenceTasks(NOT_READY).map((t) => t.id)).toEqual([
      "independence-website",
      "independence-phone",
      "independence-email",
      "independence-data",
      "independence-conversations",
      "independence-automations",
      "independence-backup",
    ]);
  });

  it("declares readiness only when everything is satisfied", () => {
    const readiness = assessCancellationReadiness(READY);
    expect(readiness.ready).toBe(true);
    expect(readiness.blocking).toEqual([]);
    expect(readiness.platformLabel).toBe("GoHighLevel");
  });

  it("names the platform in every task so the stakes are concrete", () => {
    const titles = buildMigrationIndependenceTasks(NOT_READY)
      .map((t) => `${t.title} ${t.detail}`)
      .join(" ");
    expect(titles).toMatch(/GoHighLevel/);
  });
});

describe("the website check — the one that can take a site down", () => {
  it("does not pass on liveness alone", () => {
    // A GHL-hosted funnel answers 200 at the agent's own domain. Live is not
    // the same as independent.
    const liveButUnproven = {
      ...READY,
      siteConfirmedOffPlatform: false,
      siteServedByLabel: null,
      acks: { conversations_saved: ack(), backup_exported: ack() },
    };
    const task = buildMigrationIndependenceTasks(liveButUnproven).find(
      (t) => t.id === "independence-website"
    )!;

    expect(task.complete).toBe(false);
    expect(task.detail).toMatch(/could not identify/i);
    expect(assessCancellationReadiness(liveButUnproven).ready).toBe(false);
  });

  it("passes when the serving platform is confirmed to be a different one", () => {
    const task = buildMigrationIndependenceTasks(READY).find(
      (t) => t.id === "independence-website"
    )!;
    expect(task.complete).toBe(true);
    expect(task.detail).toMatch(/will not take it down/i);
  });

  it("accepts an explicit confirmation when detection is inconclusive", () => {
    // Escape hatch for a host we cannot fingerprint — but it is a dated,
    // attributed human statement, not a silent assumption.
    const confirmed = {
      ...READY,
      siteConfirmedOffPlatform: false,
      siteServedByLabel: null,
      acks: {
        conversations_saved: ack(),
        backup_exported: ack(),
        website_independent: ack(),
      },
    };
    const task = buildMigrationIndependenceTasks(confirmed).find(
      (t) => t.id === "independence-website"
    )!;
    expect(task.complete).toBe(true);
    expect(assessCancellationReadiness(confirmed).ready).toBe(true);
  });

  it("still fails if the site is not even live", () => {
    const notLive = {
      ...READY,
      siteVerifiedLive: false,
      siteConfirmedOffPlatform: false,
      acks: { ...READY.acks, website_independent: ack() },
    };
    expect(
      buildMigrationIndependenceTasks(notLive).find(
        (t) => t.id === "independence-website"
      )!.complete
    ).toBe(false);
  });
});

describe("each dependency blocks on its own", () => {
  const cases: Array<[string, Partial<MigrationIndependenceInputs>]> = [
    ["independence-phone", { ownsPhoneNumber: false }],
    ["independence-email", { ownsEmailDomain: false }],
    ["independence-data", { contactsImported: false }],
  ];

  for (const [taskId, override] of cases) {
    it(`blocks on ${taskId}`, () => {
      const inputs = { ...READY, ...override };
      const readiness = assessCancellationReadiness(inputs);
      expect(readiness.ready).toBe(false);
      expect(readiness.blocking).toEqual([taskId]);
    });
  }

  it("blocks until conversation history is saved", () => {
    const inputs = {
      ...READY,
      acks: { backup_exported: ack() },
    };
    expect(assessCancellationReadiness(inputs).blocking).toEqual([
      "independence-conversations",
    ]);
  });

  it("blocks until a backup is exported", () => {
    const inputs = { ...READY, acks: { conversations_saved: ack() } };
    expect(assessCancellationReadiness(inputs).blocking).toEqual([
      "independence-backup",
    ]);
  });

  it("warns that a released phone number cannot be recovered", () => {
    const task = buildMigrationIndependenceTasks(NOT_READY).find(
      (t) => t.id === "independence-phone"
    )!;
    expect(task.detail).toMatch(/cannot be recovered/i);
  });
});

describe("Site Health as a whole", () => {
  const base: SiteHealthInputs = {
    profile: {
      completeness: 90,
      brokerage: "Example Realty",
      licenseNumber: "RES.0800123",
      fairHousing: true,
      noLegalTaxAdvice: true,
      optOutLanguage: "Reply STOP to opt out.",
    },
    publishedWebsite: false,
    publishedAgentSite: false,
    externalSiteVerified: true,
    customDomain: "example-realty.test",
    hasLeadForm: true,
    hasBookingPage: true,
    webChatEnabled: true,
    businessEmailVerified: true,
  };

  it("cannot reach 100% while a GHL dependency remains", () => {
    const result = computeSiteHealth({ ...base, independence: NOT_READY });

    // Every original setup task is done — the score is held down purely by
    // the things that would break on cancellation.
    expect(result.score).toBeLessThan(100);
    expect(result.cancellation?.ready).toBe(false);
    expect(result.total).toBe(15);
  });

  it("reaches 100% exactly when cancelling is safe", () => {
    const result = computeSiteHealth({ ...base, independence: READY });

    expect(result.score).toBe(100);
    expect(result.cancellation).toEqual({
      ready: true,
      blocking: [],
      platformLabel: "GoHighLevel",
    });
  });

  it("leaves a non-migrating account on the original eight tasks", () => {
    const result = computeSiteHealth(base);
    expect(result.total).toBe(8);
    expect(result.score).toBe(100);
    expect(result.cancellation).toBeNull();
  });
});

describe("a web host is not a subscription to cancel", () => {
  // `sourcePlatform` holds two different things depending on which control
  // wrote it. Picking "Keep my current host → WordPress" used to produce a
  // seven-item checklist about porting a phone number off WordPress, and
  // moved the score's denominator from 8 to 15.
  const hosts = ["wordpress", "bluehost", "godaddy", "wix", "squarespace",
    "vercel", "hostinger", "other"];

  for (const host of hosts) {
    it(`shows no cancellation checklist for ${host}`, () => {
      const inputs = { ...NOT_READY, migratedFrom: host, migratedFromLabel: host };
      expect(buildMigrationIndependenceTasks(inputs)).toEqual([]);
      expect(assessCancellationReadiness(inputs).ready).toBe(false);
    });
  }

  it("still shows it for a CRM the agent actually migrated off", () => {
    for (const crm of ["gohighlevel", "followupboss", "kvcore", "lofty", "chime"]) {
      const inputs = { ...NOT_READY, migratedFrom: crm, migratedFromLabel: crm };
      expect(buildMigrationIndependenceTasks(inputs)).toHaveLength(7);
    }
  });

  it("keeps a host-only account on the original eight tasks", () => {
    // The scoring symptom: 27% is only reachable with a denominator of 15.
    const result = computeSiteHealth({
      ...({
        profile: {},
        publishedWebsite: false,
        publishedAgentSite: false,
        hasLeadForm: false,
        hasBookingPage: false,
        webChatEnabled: false,
        businessEmailVerified: false,
      } as SiteHealthInputs),
      independence: {
        ...NOT_READY,
        migratedFrom: "wordpress",
        migratedFromLabel: "WordPress.com",
      },
    });
    expect(result.total).toBe(8);
    expect(result.cancellation?.ready).toBe(false);
  });
});
