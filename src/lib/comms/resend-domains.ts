import "server-only";

import { getResend } from "./resend";
import type { ResendConfig } from "@/types";

/**
 * Helpers for the per-sub-account dedicated sending-domain flow (platform-
 * managed model — one shared Resend account, many verified tenant domains).
 *
 * All functions are designed to be called from the settings save route and
 * return structured { ok, error } results rather than throwing, so a Resend
 * hiccup surfaces as a friendly message instead of a 500.
 */

/** A single DNS record the tenant must add, as returned by Resend. Display-only — never persisted. */
export interface DnsRecord {
  /** Resend's role label, e.g. "SPF" / "DKIM". */
  record: string;
  name: string;
  type: string;
  value: string;
  ttl?: string;
  priority?: number;
  status?: string;
}

/**
 * Two-level public suffixes where the registrable domain is the last THREE
 * labels (e.g. acme.com.au), so a bare root like acme.com.au is still a root,
 * not a subdomain. Not exhaustive — covers the common cases, AU first since
 * that's our primary market. Anything not listed is treated as a normal
 * single-label TLD (registrable = last two labels).
 */
const MULTI_PART_SUFFIXES = new Set([
  "com.au",
  "net.au",
  "org.au",
  "edu.au",
  "gov.au",
  "id.au",
  "asn.au",
  "co.uk",
  "org.uk",
  "me.uk",
  "ltd.uk",
  "plc.uk",
  "co.nz",
  "net.nz",
  "org.nz",
  "com.br",
  "com.sg",
  "com.my",
  "co.za",
  "co.jp",
  "co.in",
  "co.id",
]);

function registrableLabelCount(labels: string[]): number {
  const lastTwo = labels.slice(-2).join(".");
  return MULTI_PART_SUFFIXES.has(lastTwo) ? 3 : 2;
}

const LABEL_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export interface SubdomainValidation {
  ok: boolean;
  /** Normalised, lower-cased host with any scheme/path/@ stripped. */
  domain: string;
  error: string | null;
}

/**
 * Enforces that the tenant supplies a SUBDOMAIN, not their root domain.
 * Sending from a dedicated subdomain (e.g. mail.acme.com) isolates each
 * tenant's email reputation from their primary domain — Resend's own
 * recommendation, and what GHL nudges operators toward.
 */
export function validateSendingSubdomain(input: string): SubdomainValidation {
  const fail = (error: string): SubdomainValidation => ({
    ok: false,
    domain: "",
    error,
  });

  const domain = (input ?? "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/\.$/, "");

  if (!domain) return fail("Enter a domain.");
  if (domain.includes("@")) {
    return fail("Enter a domain, not an email address — e.g. mail.acme.com.");
  }

  const labels = domain.split(".");
  if (labels.length < 2 || !labels.every((l) => LABEL_RE.test(l))) {
    return fail("Enter a valid domain, e.g. mail.acme.com.");
  }

  if (labels.length <= registrableLabelCount(labels)) {
    return fail(
      "Use a subdomain, not your root domain — e.g. mail.acme.com instead of acme.com. A dedicated subdomain protects your main domain's email reputation.",
    );
  }

  return { ok: true, domain, error: null };
}

/** Map Resend's domain-status vocabulary onto our 3-state ResendConfig.status. */
function mapStatus(resendStatus: string | undefined): ResendConfig["status"] {
  if (resendStatus === "verified") return "verified";
  if (resendStatus === "failed") return "failed";
  return "pending";
}

function toDnsRecords(records: unknown): DnsRecord[] {
  if (!Array.isArray(records)) return [];
  return records.map((r) => {
    const rec = r as Record<string, unknown>;
    return {
      record: String(rec.record ?? ""),
      name: String(rec.name ?? ""),
      type: String(rec.type ?? ""),
      value: String(rec.value ?? ""),
      ttl: rec.ttl != null ? String(rec.ttl) : undefined,
      priority:
        typeof rec.priority === "number" ? rec.priority : undefined,
      status: rec.status != null ? String(rec.status) : undefined,
    };
  });
}

function errMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

export interface CreateDomainResult {
  ok: boolean;
  domainId: string | null;
  status: ResendConfig["status"];
  records: DnsRecord[];
  error: string | null;
}

/** Registers a new sending domain with Resend and returns its id + DNS records. */
export async function createSendingDomain(
  name: string,
): Promise<CreateDomainResult> {
  try {
    const { data, error } = await getResend().domains.create({ name });
    if (error || !data?.id) {
      return {
        ok: false,
        domainId: null,
        status: "failed",
        records: [],
        error: error?.message ?? "Resend did not return a domain id.",
      };
    }
    return {
      ok: true,
      domainId: data.id,
      status: mapStatus(data.status),
      records: toDnsRecords((data as { records?: unknown }).records),
      error: null,
    };
  } catch (err) {
    return {
      ok: false,
      domainId: null,
      status: "failed",
      records: [],
      error: errMessage(err, "Failed to register the domain with Resend."),
    };
  }
}

export interface DomainStatusResult {
  ok: boolean;
  status: ResendConfig["status"];
  records: DnsRecord[];
  error: string | null;
}

/** Reads a domain's current verification status + DNS records from Resend. */
export async function getSendingDomain(
  domainId: string,
): Promise<DomainStatusResult> {
  try {
    const { data, error } = await getResend().domains.get(domainId);
    if (error || !data) {
      return {
        ok: false,
        status: "failed",
        records: [],
        error: error?.message ?? "Domain not found on Resend.",
      };
    }
    return {
      ok: true,
      status: mapStatus(data.status),
      records: toDnsRecords((data as { records?: unknown }).records),
      error: null,
    };
  } catch (err) {
    return {
      ok: false,
      status: "failed",
      records: [],
      error: errMessage(err, "Failed to read the domain status from Resend."),
    };
  }
}

/**
 * Triggers Resend to (re)check the domain's DNS, then reads back the fresh
 * status + records. Verification is asynchronous on Resend's side, so the
 * status returned here may still be "pending" right after triggering.
 */
export async function verifySendingDomain(
  domainId: string,
): Promise<DomainStatusResult> {
  try {
    const { error } = await getResend().domains.verify(domainId);
    if (error) {
      return {
        ok: false,
        status: "pending",
        records: [],
        error: error.message,
      };
    }
  } catch (err) {
    return {
      ok: false,
      status: "pending",
      records: [],
      error: errMessage(err, "Failed to trigger verification on Resend."),
    };
  }
  return getSendingDomain(domainId);
}

/** Removes a domain from the Resend account (tenant offboarding / re-add). Best-effort. */
export async function removeSendingDomain(
  domainId: string,
): Promise<{ ok: boolean; error: string | null }> {
  try {
    const { error } = await getResend().domains.remove(domainId);
    return { ok: !error, error: error?.message ?? null };
  } catch (err) {
    return { ok: false, error: errMessage(err, "Failed to remove the domain.") };
  }
}
