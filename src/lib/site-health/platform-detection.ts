/**
 * Working out who actually serves an agent's website.
 *
 * Site Health is meant to answer one question: is it safe to cancel the old
 * platform? A liveness check alone cannot answer it. A site still hosted as a
 * GoHighLevel funnel answers 200 over HTTPS at the agent's own domain, so
 * "your website is live" is perfectly compatible with "cancelling GHL takes
 * your website down tonight".
 *
 * This module looks for evidence of the previous platform in the response.
 * The critical rule: absence of evidence is NOT evidence of independence.
 * Detection is heuristic, so an inconclusive result must never silently pass
 * as "you have migrated" — it returns `unknown` and the caller asks the agent
 * to confirm against the evidence rather than guessing on their behalf.
 */

export type DetectionConfidence = "confirmed" | "unknown";

export interface PlatformSignature {
  /** Matches BusinessSourcePlatform ids where one exists. */
  id: string;
  label: string;
  /** Host suffixes the site (or its redirect target) is served from. */
  hosts?: string[];
  /** Response header name/value fragments, lowercased. */
  headers?: Array<{ name: string; contains?: string }>;
  /** Fragments that appear in the served HTML (asset URLs, embeds). */
  body?: string[];
}

export const PLATFORM_SIGNATURES: PlatformSignature[] = [
  {
    id: "gohighlevel",
    label: "GoHighLevel",
    hosts: [
      "leadconnectorhq.com",
      "msgsndr.com",
      "gohighlevel.com",
      "clientclub.net",
    ],
    body: ["leadconnectorhq", "msgsndr", "gohighlevel"],
  },
  {
    id: "hostinger",
    label: "Hostinger",
    // ludicrous.cloud is where Hostinger Horizons ("Vibe") serves sites, so a
    // CNAME pointing there is a positive identification of Hostinger — which
    // is exactly what proves a site is no longer on GoHighLevel.
    hosts: ["ludicrous.cloud", "hostinger.com", "hostingersite.com"],
    headers: [{ name: "x-powered-by", contains: "hostinger" }],
    body: ["ludicrous.cloud", "hostinger"],
  },
  {
    id: "kvcore",
    label: "kvCORE",
    hosts: ["kvcore.com", "insiderealestate.com", "chimeinc.com"],
    body: ["kvcore", "insiderealestate"],
  },
  {
    id: "wix",
    label: "Wix",
    hosts: ["wixsite.com", "wix.com"],
    headers: [{ name: "x-wix-request-id" }, { name: "server", contains: "pepyaka" }],
    body: ["static.parastorage.com", "wixstatic.com"],
  },
  {
    id: "squarespace",
    label: "Squarespace",
    hosts: ["squarespace.com"],
    headers: [{ name: "server", contains: "squarespace" }],
    body: ["squarespace-cdn.com"],
  },
  {
    id: "followupboss",
    label: "Follow Up Boss",
    hosts: ["followupboss.com", "fubhost.com"],
    body: ["followupboss"],
  },
  {
    id: "lofty",
    label: "Lofty",
    hosts: ["lofty.com", "chime.me"],
    body: ["lofty.com", "chime.me"],
  },
];

export interface DetectionInput {
  /** Host actually serving the page, after following redirects. */
  finalHost: string;
  /** Response headers, names lowercased. */
  headers: Record<string, string>;
  /** A capped slice of the served HTML. */
  body?: string;
  /** Hosts seen along the redirect chain, including the first request. */
  redirectHosts?: string[];
}

export interface PlatformDetection {
  /** Signature id when a platform was positively identified. */
  platform: string | null;
  label: string | null;
  confidence: DetectionConfidence;
  /** Human-readable proof, shown to the agent so they can judge it. */
  evidence: string[];
}

const hostMatches = (host: string, suffix: string) =>
  host === suffix || host.endsWith(`.${suffix}`);

/**
 * Identify the serving platform, if it can be identified at all.
 *
 * Returns `confidence: "unknown"` with `platform: null` when nothing matched
 * — meaning "we could not tell", never "it is clean".
 */
export function detectHostingPlatform(
  input: DetectionInput
): PlatformDetection {
  const finalHost = input.finalHost.toLowerCase();
  const chain = (input.redirectHosts ?? []).map((h) => h.toLowerCase());
  const hosts = [...new Set([finalHost, ...chain])];
  const headers = Object.fromEntries(
    Object.entries(input.headers ?? {}).map(([k, v]) => [
      k.toLowerCase(),
      String(v).toLowerCase(),
    ])
  );
  const body = (input.body ?? "").toLowerCase();

  for (const signature of PLATFORM_SIGNATURES) {
    const evidence: string[] = [];

    for (const suffix of signature.hosts ?? []) {
      const hit = hosts.find((host) => hostMatches(host, suffix));
      if (hit) evidence.push(`served from ${hit}`);
    }
    for (const header of signature.headers ?? []) {
      const value = headers[header.name];
      if (value === undefined) continue;
      if (!header.contains || value.includes(header.contains)) {
        evidence.push(`response header ${header.name}: ${value.slice(0, 60)}`);
      }
    }
    for (const fragment of signature.body ?? []) {
      if (body.includes(fragment.toLowerCase())) {
        evidence.push(`page references ${fragment}`);
      }
    }

    if (evidence.length > 0) {
      return {
        platform: signature.id,
        label: signature.label,
        confidence: "confirmed",
        evidence,
      };
    }
  }

  return {
    platform: null,
    label: null,
    confidence: "unknown",
    // Still hand back what was observed — an agent deciding whether to cancel
    // deserves to see the basis, not a bare verdict.
    evidence: [
      `served from ${finalHost}`,
      headers["server"] ? `response header server: ${headers["server"]}` : "",
    ].filter(Boolean),
  };
}

/**
 * Whether the site is demonstrably off a specific previous platform.
 *
 * `false` for an inconclusive scan on purpose: proving a negative from
 * heuristics is not possible, and a wrong "yes" here costs an agent their
 * website.
 */
export function isConfirmedOffPlatform(
  detection: PlatformDetection | null | undefined,
  previousPlatform: string | null | undefined
): boolean {
  if (!detection || !previousPlatform) return false;
  if (detection.confidence !== "confirmed") return false;
  return detection.platform !== previousPlatform;
}
