/**
 * DNS cutover: reading what a domain has today, and working out what has to
 * be re-created before its nameservers move.
 *
 * The failure this exists to prevent is specific and common. An agent points
 * their domain at a new DNS host, adds the website records, switches the
 * nameservers — and their email stops, silently, because MX and the SPF/DKIM/
 * DMARC TXT records lived at the old host and were never copied across. They
 * usually find out days later from a client who never got a reply.
 *
 * So the flow never asks an agent to *know* their records. It reads them,
 * shows them, and refuses to advance to the nameserver switch until the ones
 * that carry email have been re-created.
 *
 * Pure logic only — the API route owns the actual resolver calls.
 */

export type DnsRecordKind = "NS" | "MX" | "TXT" | "A" | "AAAA" | "CNAME";

export interface DnsRecordSnapshot {
  kind: DnsRecordKind;
  /** Host the record sits on, e.g. "@" for the apex or "www". */
  name: string;
  value: string;
  /** MX only. */
  priority?: number;
}

export interface DomainDnsSnapshot {
  domain: string;
  nameservers: string[];
  records: DnsRecordSnapshot[];
  checkedAt: string;
}

export type RecordPurpose = "email" | "website" | "verification" | "other";

/** Nameserver suffixes → the control panel an agent has to log into. */
const DNS_HOSTS: Array<{ id: string; label: string; suffixes: string[]; url?: string }> = [
  { id: "cloudflare", label: "Cloudflare", suffixes: ["ns.cloudflare.com"], url: "https://dash.cloudflare.com" },
  { id: "godaddy", label: "GoDaddy", suffixes: ["domaincontrol.com", "godaddy.com"], url: "https://dcc.godaddy.com/manage/dns" },
  { id: "namecheap", label: "Namecheap", suffixes: ["registrar-servers.com", "namecheaphosting.com"], url: "https://ap.www.namecheap.com/domains/list" },
  { id: "google", label: "Google Domains / Squarespace", suffixes: ["googledomains.com", "google.com"], url: "https://domains.squarespace.com" },
  { id: "squarespace", label: "Squarespace", suffixes: ["squarespacedns.com"], url: "https://account.squarespace.com/domains" },
  { id: "wix", label: "Wix", suffixes: ["wixdns.net"], url: "https://www.wix.com/my-account/domains" },
  { id: "bluehost", label: "Bluehost", suffixes: ["bluehost.com"], url: "https://my.bluehost.com" },
  { id: "hostinger", label: "Hostinger", suffixes: ["hostinger.com", "dns-parking.com"], url: "https://hpanel.hostinger.com" },
  { id: "gohighlevel", label: "GoHighLevel", suffixes: ["leadconnectorhq.com", "msgsndr.com"] },
  { id: "aws", label: "AWS Route 53", suffixes: ["awsdns"], url: "https://console.aws.amazon.com/route53" },
  { id: "vercel", label: "Vercel", suffixes: ["vercel-dns.com"], url: "https://vercel.com/dashboard/domains" },
];

export interface DnsHostGuess {
  id: string | null;
  label: string;
  url: string | null;
}

/**
 * Work out whose DNS panel currently controls the domain, so the guide can
 * say "log into GoDaddy" instead of "log into your DNS provider" — which is
 * the sentence that stalls a first-timer.
 */
export function identifyDnsHost(nameservers: string[]): DnsHostGuess {
  const lowered = nameservers.map((ns) => ns.toLowerCase().replace(/\.$/, ""));
  for (const host of DNS_HOSTS) {
    if (
      lowered.some((ns) =>
        host.suffixes.some((suffix) => ns.endsWith(suffix) || ns.includes(suffix))
      )
    ) {
      return { id: host.id, label: host.label, url: host.url ?? null };
    }
  }
  return { id: null, label: "your current DNS provider", url: null };
}

const SPF_RE = /^"?v=spf1\b/i;
const DMARC_NAME = "_dmarc";
const VERIFICATION_HINTS = [
  "google-site-verification",
  "facebook-domain-verification",
  "ms=",
  "stripe-verification",
  "_acme-challenge",
];

/**
 * What a record is for.
 *
 * Email classification is deliberately broad: SPF, DKIM, and DMARC all live
 * in TXT records, and losing any of them sends mail to spam even when
 * delivery still technically works.
 */
export function classifyRecord(record: DnsRecordSnapshot): RecordPurpose {
  if (record.kind === "MX") return "email";
  if (record.kind === "TXT") {
    const name = record.name.toLowerCase();
    const value = record.value.toLowerCase();
    if (
      SPF_RE.test(record.value) ||
      name.startsWith(DMARC_NAME) ||
      name.includes("_domainkey") ||
      value.includes("v=dmarc1") ||
      value.includes("v=dkim1")
    ) {
      return "email";
    }
    if (VERIFICATION_HINTS.some((hint) => name.includes(hint) || value.includes(hint))) {
      return "verification";
    }
    return "other";
  }
  if (record.kind === "A" || record.kind === "AAAA" || record.kind === "CNAME") {
    return "website";
  }
  return "other";
}

/**
 * The records that must be re-created at the new DNS host before the
 * nameservers change. Email first — it is the one that breaks silently.
 */
export function recordsToPreserve(
  snapshot: DomainDnsSnapshot | null | undefined
): DnsRecordSnapshot[] {
  if (!snapshot) return [];
  const rank: Record<RecordPurpose, number> = {
    email: 0,
    verification: 1,
    website: 2,
    other: 3,
  };
  return snapshot.records
    .filter((record) => {
      const purpose = classifyRecord(record);
      return purpose === "email" || purpose === "verification";
    })
    .sort((a, b) => rank[classifyRecord(a)] - rank[classifyRecord(b)]);
}

export interface EmailRisk {
  /** True when the domain currently receives mail. */
  hasEmail: boolean;
  mxCount: number;
  /** SPF / DKIM / DMARC records that protect deliverability. */
  authCount: number;
  warning: string | null;
}

/**
 * Whether switching nameservers would take email down.
 *
 * A domain with MX records is a domain someone receives business mail on.
 * Moving its nameservers without re-creating them is an outage that starts
 * quietly and is only noticed when a client says they never heard back.
 */
export function assessEmailRisk(
  snapshot: DomainDnsSnapshot | null | undefined
): EmailRisk {
  if (!snapshot) {
    return { hasEmail: false, mxCount: 0, authCount: 0, warning: null };
  }
  const mx = snapshot.records.filter((r) => r.kind === "MX");
  const auth = snapshot.records.filter(
    (r) => r.kind === "TXT" && classifyRecord(r) === "email"
  );
  if (mx.length === 0) {
    return {
      hasEmail: false,
      mxCount: 0,
      authCount: auth.length,
      warning: null,
    };
  }
  return {
    hasEmail: true,
    mxCount: mx.length,
    authCount: auth.length,
    warning: `This domain receives email — ${mx.length} mail ${mx.length === 1 ? "record" : "records"}${auth.length > 0 ? ` and ${auth.length} anti-spam ${auth.length === 1 ? "record" : "records"}` : ""}. Copy every one of them to the new DNS host before you change your nameservers, or your email will stop arriving.`,
  };
}

/** Have the nameservers actually moved to the intended host yet? */
export function nameserversMatch(
  current: string[],
  expected: string[]
): boolean {
  if (expected.length === 0 || current.length === 0) return false;
  const norm = (ns: string) => ns.toLowerCase().replace(/\.$/, "").trim();
  const currentSet = new Set(current.map(norm));
  return expected.map(norm).every((ns) => currentSet.has(ns));
}

/**
 * Did the destination keep the email records?
 *
 * Run after the switch: a domain that had MX before and has none now is an
 * email outage in progress, and the agent needs to hear that immediately.
 */
export function emailSurvivedCutover(
  before: DomainDnsSnapshot | null | undefined,
  after: DomainDnsSnapshot | null | undefined
): { ok: boolean; message: string | null } {
  const had = assessEmailRisk(before);
  if (!had.hasEmail) return { ok: true, message: null };
  const now = assessEmailRisk(after);
  if (now.mxCount === 0) {
    return {
      ok: false,
      message:
        "Your mail records are missing at the new DNS host. Email to this domain is not being delivered. Add the MX records back now — the list is saved in the previous step.",
    };
  }
  if (now.authCount < had.authCount) {
    return {
      ok: false,
      message:
        "Email is being delivered, but some SPF/DKIM/DMARC records did not make it across. Your messages are more likely to land in spam until they are restored.",
    };
  }
  return { ok: true, message: "Email records survived the move." };
}

/** Copy-paste friendly line for a record, matching most DNS panel columns. */
export function formatRecordForCopy(record: DnsRecordSnapshot): string {
  const name = record.name || "@";
  return record.kind === "MX"
    ? `${record.kind}\t${name}\t${record.priority ?? 10}\t${record.value}`
    : `${record.kind}\t${name}\t${record.value}`;
}
