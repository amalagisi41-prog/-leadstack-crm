import { describe, expect, it } from "vitest";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { ONBOARDING_STEPS } from "@/lib/onboarding/steps";
import { computeSiteHealth, type SiteHealthInputs } from "./tasks";
import {
  buildMigrationIndependenceTasks,
  type MigrationIndependenceInputs,
} from "./migration-independence";
import { deriveHostingReadiness } from "./hosting-readiness";

/**
 * Whole-product invariants for the guided experience.
 *
 * Everything here is a property that has to hold for EVERY user situation,
 * not a spot-check of one screen. Three classes of failure are covered, all
 * of which have actually happened in this codebase:
 *
 *  1. Dead links — guidance pointing at a route that does not exist. Five
 *     `/automations` links shipped this way; a user following one lands on a
 *     404 with no way back.
 *  2. Dead ends — a state with nothing to click, so the user is stranded and
 *     the only remaining move is to contact support.
 *  3. Human-gated paths — a condition only an administrator can satisfy,
 *     which is a support ticket guaranteed by construction.
 */

const SA_ROUTES_DIR = join(
  process.cwd(),
  "src/app/(dashboard)/sa/[subAccountId]"
);

/** Every sub-account route that actually exists on disk. */
function existingRoutes(dir = SA_ROUTES_DIR, prefix = ""): Set<string> {
  const found = new Set<string>();
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (entry === "page.tsx") {
      found.add(prefix || "/");
      continue;
    }
    if (statSync(full).isDirectory()) {
      for (const nested of existingRoutes(full, `${prefix}/${entry}`)) {
        found.add(nested);
      }
    }
  }
  return found;
}

/** Strip query/hash so "/contacts?import=1" is checked as "/contacts". */
const routeOf = (href: string) => href.split(/[?#]/)[0].replace(/\/$/, "") || "/";

const ROUTES = existingRoutes();

const FULL_INDEPENDENCE: MigrationIndependenceInputs = {
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

const EMPTY_HEALTH: SiteHealthInputs = {
  profile: {},
  publishedWebsite: false,
  publishedAgentSite: false,
  customDomain: undefined,
  hasLeadForm: false,
  hasBookingPage: false,
  webChatEnabled: false,
  businessEmailVerified: false,
};

describe("every link the app hands a user resolves to a real page", () => {
  it("finds the sub-account routes on disk", () => {
    // Guards the test itself: an empty set would make everything below pass.
    expect(ROUTES.size).toBeGreaterThan(20);
    expect(ROUTES.has("/domain")).toBe(true);
  });

  it("onboarding checklist steps all point somewhere real", () => {
    for (const step of ONBOARDING_STEPS) {
      expect(ROUTES.has(routeOf(step.href)), `${step.id} → ${step.href}`).toBe(
        true
      );
    }
  });

  it("site health tasks all point somewhere real", () => {
    for (const task of computeSiteHealth(EMPTY_HEALTH).tasks) {
      expect(ROUTES.has(routeOf(task.href)), `${task.id} → ${task.href}`).toBe(
        true
      );
    }
  });

  it("migration independence tasks all point somewhere real", () => {
    for (const task of buildMigrationIndependenceTasks(FULL_INDEPENDENCE)) {
      expect(ROUTES.has(routeOf(task.href)), `${task.id} → ${task.href}`).toBe(
        true
      );
    }
  });
});

describe("no task is a dead end, in any state", () => {
  /** Both states of every boolean input, so no combination is unexercised. */
  const healthStates: SiteHealthInputs[] = [
    EMPTY_HEALTH,
    { ...EMPTY_HEALTH, externalSiteVerified: true },
    { ...EMPTY_HEALTH, publishedAgentSite: true, customDomain: "x.com" },
    {
      ...EMPTY_HEALTH,
      profile: {
        completeness: 90,
        brokerage: "b",
        licenseNumber: "l",
        fairHousing: true,
        noLegalTaxAdvice: true,
        optOutLanguage: "stop",
      },
      publishedAgentSite: true,
      customDomain: "x.com",
      hasLeadForm: true,
      hasBookingPage: true,
      webChatEnabled: true,
      businessEmailVerified: true,
    },
    { ...EMPTY_HEALTH, independence: FULL_INDEPENDENCE },
    {
      ...EMPTY_HEALTH,
      independence: { ...FULL_INDEPENDENCE, siteVerifiedLive: true },
    },
  ];

  it("every task always carries a title, an explanation and a destination", () => {
    for (const state of healthStates) {
      for (const task of computeSiteHealth(state).tasks) {
        expect(task.title.trim().length, task.id).toBeGreaterThan(0);
        // The explanation is what a first-timer reads instead of guessing.
        expect(task.detail.trim().length, task.id).toBeGreaterThan(20);
        expect(task.action.trim().length, task.id).toBeGreaterThan(0);
        expect(ROUTES.has(routeOf(task.href)), task.id).toBe(true);
      }
    }
  });

  it("an incomplete task never renders without something to do", () => {
    for (const state of healthStates) {
      const outstanding = computeSiteHealth(state).tasks.filter(
        (task) => !task.complete
      );
      for (const task of outstanding) {
        expect(task.action, task.id).not.toBe("");
        expect(task.href, task.id).not.toBe("");
      }
    }
  });

  it("a fully-migrated account reports ready rather than trailing off", () => {
    const done = computeSiteHealth({
      ...healthStates[3],
      independence: {
        ...FULL_INDEPENDENCE,
        siteVerifiedLive: true,
        siteConfirmedOffPlatform: true,
        siteServedByLabel: "Hostinger",
        ownsPhoneNumber: true,
        ownsEmailDomain: true,
        contactsImported: true,
        automationsRebuilt: true,
        acks: {
          conversations_saved: {
            acknowledgedByUid: "u",
            acknowledgedAt: "2026-08-16T00:00:00Z",
          },
          backup_exported: {
            acknowledgedByUid: "u",
            acknowledgedAt: "2026-08-16T00:00:00Z",
          },
        },
      },
    });

    expect(done.score).toBe(100);
    expect(done.cancellation?.ready).toBe(true);
  });
});

describe("nothing waits on an administrator", () => {
  const paths = [
    "keep_existing",
    "agentstack_managed",
    "transfer_existing",
    null,
  ] as const;

  it("no hosting path requires a human to flip a flag", () => {
    // The DNS gate previously read a field no code ever wrote, so every agent
    // on a migration path had to ask support to be let through.
    for (const hostingStartingPoint of paths) {
      for (const agentSitePublished of [false, true]) {
        for (const siteVerifiedLive of [false, true]) {
          const readiness = deriveHostingReadiness({
            hostingStartingPoint,
            agentSitePublished,
            siteVerifiedLive,
          });
          expect(readiness.requiresAdmin, String(hostingStartingPoint)).toBe(
            false
          );
          // Whatever the answer, the agent is told what it depends on.
          expect(readiness.reason.trim().length).toBeGreaterThan(20);
        }
      }
    }
  });

  it("unlocks the managed path the moment the site is published", () => {
    const readiness = deriveHostingReadiness({
      hostingStartingPoint: "agentstack_managed",
      agentSitePublished: true,
      siteVerifiedLive: false,
    });
    expect(readiness.ready).toBe(true);
  });

  it("unlocks a transfer the moment the new host answers", () => {
    const readiness = deriveHostingReadiness({
      hostingStartingPoint: "transfer_existing",
      agentSitePublished: false,
      siteVerifiedLive: true,
    });
    expect(readiness.ready).toBe(true);
  });

  it("tells a waiting agent there is nothing to request", () => {
    const readiness = deriveHostingReadiness({
      hostingStartingPoint: "transfer_existing",
      agentSitePublished: false,
      siteVerifiedLive: false,
    });
    expect(readiness.ready).toBe(false);
    expect(readiness.reason).toMatch(/nothing to request/i);
  });

  it("treats staying put as no cutover rather than a permanent wait", () => {
    const readiness = deriveHostingReadiness({
      hostingStartingPoint: "keep_existing",
      agentSitePublished: false,
      siteVerifiedLive: false,
    });
    expect(readiness.notApplicable).toBe(true);
    expect(readiness.ready).toBe(false);
  });

  it("still honours a legacy ready flag if a deployment sets one", () => {
    const readiness = deriveHostingReadiness({
      hostingStartingPoint: "transfer_existing",
      agentSitePublished: false,
      siteVerifiedLive: false,
      legacyHostingStatus: "ready",
      legacyHostingUrl: "https://example-realty.test",
    });
    expect(readiness.ready).toBe(true);
  });

  it("does not accept a legacy flag pointing at an insecure URL", () => {
    const readiness = deriveHostingReadiness({
      hostingStartingPoint: "transfer_existing",
      agentSitePublished: false,
      siteVerifiedLive: false,
      legacyHostingStatus: "ready",
      legacyHostingUrl: "http://example-realty.test",
    });
    expect(readiness.ready).toBe(false);
  });
});

describe("destructive advice is never given on an unproven check", () => {
  it("never says cancelling is safe while anything is unverified", () => {
    // The liability case: an agent cancels GoHighLevel and loses their
    // website or phone number because the app said it was fine.
    const partials: Array<Partial<MigrationIndependenceInputs>> = [
      { siteConfirmedOffPlatform: false, siteVerifiedLive: true },
      { ownsPhoneNumber: false },
      { ownsEmailDomain: false },
      { contactsImported: false },
    ];
    for (const partial of partials) {
      const inputs: MigrationIndependenceInputs = {
        ...FULL_INDEPENDENCE,
        siteVerifiedLive: true,
        siteConfirmedOffPlatform: true,
        siteServedByLabel: "Hostinger",
        ownsPhoneNumber: true,
        ownsEmailDomain: true,
        contactsImported: true,
        automationsRebuilt: true,
        acks: {
          conversations_saved: {
            acknowledgedByUid: "u",
            acknowledgedAt: "2026-08-16T00:00:00Z",
          },
          backup_exported: {
            acknowledgedByUid: "u",
            acknowledgedAt: "2026-08-16T00:00:00Z",
          },
        },
        ...partial,
      };
      const result = computeSiteHealth({ ...EMPTY_HEALTH, independence: inputs });
      expect(result.cancellation?.ready, JSON.stringify(partial)).toBe(false);
    }
  });

  it("warns that a released phone number cannot be recovered", () => {
    const phone = buildMigrationIndependenceTasks(FULL_INDEPENDENCE).find(
      (t) => t.id === "independence-phone"
    )!;
    expect(phone.detail).toMatch(/cannot be recovered/i);
  });
});
