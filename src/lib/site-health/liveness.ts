/**
 * Verifying that an agent's own website is actually live.
 *
 * Most agents arriving at AgentStack already have a website they have no
 * intention of rebuilding. Before this existed, Site Health's "Publish your
 * website" task could only be satisfied by a site published *inside*
 * AgentStack, so those agents sat permanently at 7/8 with nothing left they
 * could do about it.
 *
 * The check is deliberately zero-touch: the domain is already saved, so the
 * server fetches it and records the result. No checkbox to tick, no DNS
 * knowledge, and — unlike a self-attestation — the answer is verified, so a
 * site that goes dark stops counting on the next re-check.
 *
 * Pure logic only; the route owns the fetch and the Firestore write.
 */

/** How long a successful verification counts before it is re-checked. */
export const SITE_VERIFICATION_TTL_DAYS = 30;

export type SiteLivenessStatus = "live" | "unreachable" | "insecure" | "error";

export interface SiteVerificationRecord {
  /** The exact URL that was fetched. */
  url: string;
  status: SiteLivenessStatus;
  /** HTTP status code, when a response was received at all. */
  statusCode?: number;
  /** Human-readable explanation, shown to the agent on failure. */
  reason: string;
  /** ISO timestamp of the check. */
  checkedAt: string;
}

/**
 * Decide what an HTTP response means for liveness.
 *
 * 2xx and 3xx both count: a redirect is how most real sites answer their
 * apex domain, and following it to a 200 tells us nothing extra about
 * whether the agent has a website. 401/403 also count — a site behind
 * Cloudflare or basic auth is still a site that exists.
 */
export function evaluateLivenessResponse(input: {
  url: string;
  protocol: string;
  statusCode: number;
  checkedAt?: string;
}): SiteVerificationRecord {
  const checkedAt = input.checkedAt ?? new Date().toISOString();
  const base = { url: input.url, statusCode: input.statusCode, checkedAt };

  if (input.protocol !== "https:") {
    return {
      ...base,
      status: "insecure",
      reason:
        "Your site answered over an insecure connection (http). Add an SSL certificate at your host, then check again.",
    };
  }
  if (input.statusCode >= 200 && input.statusCode < 400) {
    return { ...base, status: "live", reason: "Your website is live." };
  }
  if (input.statusCode === 401 || input.statusCode === 403) {
    return {
      ...base,
      status: "live",
      reason:
        "Your website is live (it is password-protected or behind a firewall, which still counts).",
    };
  }
  if (input.statusCode >= 500) {
    return {
      ...base,
      status: "unreachable",
      reason: `Your host returned a server error (${input.statusCode}). The domain is pointed correctly but the site itself is down.`,
    };
  }
  return {
    ...base,
    status: "unreachable",
    reason: `Nothing is published at that address yet (${input.statusCode}).`,
  };
}

/** Result for a request that never produced a response at all. */
export function livenessNetworkFailure(
  url: string,
  checkedAt = new Date().toISOString()
): SiteVerificationRecord {
  return {
    url,
    status: "unreachable",
    reason:
      "We could not reach that address. If you just changed DNS it can take a few hours to take effect.",
    checkedAt,
  };
}

/**
 * Whether a stored verification still counts.
 *
 * Tied to the domain currently saved on the sub-account: if an agent changes
 * their domain, the old verification proves nothing about the new one and
 * must not carry the task.
 */
export function isVerificationCurrent(
  record: SiteVerificationRecord | null | undefined,
  customDomain: string | null | undefined,
  now: Date = new Date()
): boolean {
  if (!record || record.status !== "live") return false;
  const domain = (customDomain ?? "").trim().toLowerCase();
  if (!domain) return false;

  let recordHost: string;
  try {
    recordHost = new URL(record.url).hostname.toLowerCase();
  } catch {
    return false;
  }
  const expected = domain
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "")
    .replace(/^www\./, "");
  if (recordHost.replace(/^www\./, "") !== expected) return false;

  const checked = Date.parse(record.checkedAt);
  if (Number.isNaN(checked)) return false;
  const ageDays = (now.getTime() - checked) / 86_400_000;
  return ageDays >= 0 && ageDays <= SITE_VERIFICATION_TTL_DAYS;
}
