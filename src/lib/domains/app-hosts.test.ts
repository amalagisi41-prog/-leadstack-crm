import { describe, it, expect, beforeEach, afterEach } from "vitest";

import {
  appHost,
  isAppHost,
  isCustomDomainHost,
  normalizeHost,
} from "./app-hosts";

/**
 * This is the single decision custom-domain routing makes on the edge, and
 * both directions of getting it wrong are bad:
 *
 *   - Classifying a customer's domain as ours → their site never loads.
 *   - Classifying OUR host as a customer's → the dashboard gets rewritten into
 *     the public site renderer and the whole app goes down.
 *
 * The second is catastrophic, so the rule is: anything not positively
 * identifiable as a customer domain is treated as ours.
 */

const ORIGINAL = process.env.NEXT_PUBLIC_APP_URL;

beforeEach(() => {
  process.env.NEXT_PUBLIC_APP_URL = "https://app.agentstackcrm.com";
});

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
  else process.env.NEXT_PUBLIC_APP_URL = ORIGINAL;
});

describe("normalizeHost", () => {
  it("lowercases and strips the port", () => {
    expect(normalizeHost("Example.COM:3000")).toBe("example.com");
  });

  it("returns empty for nullish input", () => {
    expect(normalizeHost(null)).toBe("");
    expect(normalizeHost(undefined)).toBe("");
  });
});

describe("appHost", () => {
  it("reads the hostname out of NEXT_PUBLIC_APP_URL", () => {
    expect(appHost()).toBe("app.agentstackcrm.com");
  });

  it("returns empty when unset, so routing stays off", () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    expect(appHost()).toBe("");
  });

  it("returns empty rather than throwing on a malformed value", () => {
    process.env.NEXT_PUBLIC_APP_URL = "not a url";
    expect(appHost()).toBe("");
  });
});

describe("isAppHost — must never rewrite the app itself", () => {
  it.each([
    ["app.agentstackcrm.com", "the deployment's own host"],
    ["www.app.agentstackcrm.com", "www of its own host"],
    ["localhost", "local development"],
    ["localhost:3000", "local development with a port"],
    ["sub.localhost", "a localhost subdomain"],
    ["127.0.0.1", "loopback"],
    ["agentstack.vercel.app", "the Vercel production host"],
    ["agentstack-git-branch-team.vercel.app", "a Vercel preview deployment"],
  ])("treats %s as the app (%s)", (host) => {
    expect(isAppHost(host)).toBe(true);
    expect(isCustomDomainHost(host)).toBe(false);
  });

  it("treats a missing Host header as the app rather than guessing", () => {
    expect(isAppHost(null)).toBe(true);
    expect(isAppHost("")).toBe(true);
  });

  it("treats EVERY host as the app when the deployment can't name itself", () => {
    // A deployment with no NEXT_PUBLIC_APP_URL cannot distinguish its own host
    // from a customer's, so it must not rewrite anything. Failing closed here
    // means custom domains don't work; failing open would take the app down.
    delete process.env.NEXT_PUBLIC_APP_URL;
    expect(isAppHost("caseyspropertygroup.com")).toBe(true);
    expect(isCustomDomainHost("caseyspropertygroup.com")).toBe(false);
  });
});

describe("isCustomDomainHost — a real connected domain", () => {
  it.each([
    "caseyspropertygroup.com",
    "www.caseyspropertygroup.com",
    "janedoehomes.com",
  ])("routes %s to the published site", (host) => {
    expect(isCustomDomainHost(host)).toBe(true);
    expect(isAppHost(host)).toBe(false);
  });

  it("is case- and port-insensitive", () => {
    expect(isCustomDomainHost("CaseysPropertyGroup.com:443")).toBe(true);
  });
});
