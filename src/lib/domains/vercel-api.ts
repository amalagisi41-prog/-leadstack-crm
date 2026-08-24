import "server-only";

/**
 * Talks to the Vercel REST API to actually register a customer's domain on
 * this deployment's Vercel project.
 *
 * WHY THIS EXISTS
 * ----------------
 * "Connect Domain" used to save `customDomain` to Firestore and verify DNS
 * against this deployment's own resolvable address — and reported "live"
 * the moment DNS matched. But DNS pointing at Vercel's shared edge network
 * is not the same as Vercel actually routing that hostname to THIS project.
 * Vercel refuses traffic for any domain that hasn't been explicitly added
 * to a project; until that happens the visitor gets Vercel's own "Domain
 * not configured" page, never the agent's site. The DNS-only check
 * confirmed a broken setup as correct — the exact failure mode CLAUDE.md's
 * "no guessing" standard exists to prevent ("absence of evidence is never
 * evidence of success").
 *
 * OPTIONAL BY DESIGN
 * -------------------
 * Not every buyer deploys to Vercel (the domain guide also documents
 * Netlify/other hosts as options), and a buyer who does still has to
 * create a Vercel API token themselves — it's account-level credentials,
 * not something that ships. So this whole module degrades cleanly: absent
 * `VERCEL_TOKEN` + `VERCEL_PROJECT_ID`, `vercelApiConfigured()` is false and
 * every caller falls back to DNS-only verification with an honest caveat
 * instead of a false "live" — never a silent no-op that still claims
 * success.
 */

export function vercelApiConfigured(): boolean {
  return Boolean(
    process.env.VERCEL_TOKEN?.trim() && process.env.VERCEL_PROJECT_ID?.trim()
  );
}

function teamQuery(): string {
  const teamId = process.env.VERCEL_TEAM_ID?.trim();
  return teamId ? `?teamId=${encodeURIComponent(teamId)}` : "";
}

function authHeaders(): HeadersInit {
  return {
    Authorization: `Bearer ${process.env.VERCEL_TOKEN}`,
    "Content-Type": "application/json",
  };
}

export type VercelDomainOutcome =
  | { ok: true; status: "added" | "already_added" }
  | { ok: false; status: "error"; message: string };

/**
 * Registers `domain` on this deployment's Vercel project. Idempotent — a
 * domain already attached to this project (or reported as already in use,
 * which Vercel's API cannot distinguish from "attached here" without a
 * second call) is treated as success, not an error, so re-saving an
 * unchanged domain never surfaces a scary message for the common case.
 */
export async function addDomainToVercelProject(
  domain: string
): Promise<VercelDomainOutcome> {
  if (!vercelApiConfigured()) {
    return {
      ok: false,
      status: "error",
      message: "Vercel API isn't configured on this deployment.",
    };
  }
  const projectId = process.env.VERCEL_PROJECT_ID;
  try {
    const res = await fetch(
      `https://api.vercel.com/v10/projects/${projectId}/domains${teamQuery()}`,
      {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ name: domain }),
      }
    );
    if (res.ok) return { ok: true, status: "added" };

    const body = (await res.json().catch(() => ({}))) as {
      error?: { code?: string; message?: string };
    };
    const code = body.error?.code;
    if (code === "domain_already_in_use" || res.status === 409) {
      return { ok: true, status: "already_added" };
    }
    const message =
      typeof body.error?.message === "string"
        ? body.error.message
        : `Vercel returned an unexpected ${res.status} response.`;
    return { ok: false, status: "error", message };
  } catch (err) {
    return {
      ok: false,
      status: "error",
      message: err instanceof Error ? err.message : "Could not reach Vercel.",
    };
  }
}

/**
 * Best-effort deregistration when a domain is disconnected or replaced.
 * Never throws — a domain left behind on the Vercel project after a
 * disconnect isn't harmful (nothing else points DNS at it), it just means a
 * future reconnect attempt sees "already_added" instead of "added".
 */
export async function removeDomainFromVercelProject(
  domain: string
): Promise<void> {
  if (!vercelApiConfigured()) return;
  const projectId = process.env.VERCEL_PROJECT_ID;
  try {
    await fetch(
      `https://api.vercel.com/v9/projects/${projectId}/domains/${encodeURIComponent(domain)}${teamQuery()}`,
      { method: "DELETE", headers: authHeaders() }
    );
  } catch {
    // Best-effort — see doc comment above.
  }
}

export interface VercelDomainStatus {
  /** True once Vercel has this domain attached to THIS project. */
  attached: boolean;
  /** True once Vercel's own DNS check on the domain has passed. Distinct
   * from our own DNS check (`domain/verify`), which only confirms records
   * point at *a* Vercel host, not that Vercel has claimed this specific
   * domain for this project. */
  verified: boolean;
}

/**
 * Looks up whether `domain` is actually attached to this project on
 * Vercel's side, and whether Vercel considers it verified. Returns `null`
 * (not a guess) when the deployment isn't configured for this check or the
 * lookup itself failed — callers must treat `null` as "we don't know",
 * never as "not attached".
 */
export async function getVercelDomainStatus(
  domain: string
): Promise<VercelDomainStatus | null> {
  if (!vercelApiConfigured()) return null;
  const projectId = process.env.VERCEL_PROJECT_ID;
  try {
    const res = await fetch(
      `https://api.vercel.com/v9/projects/${projectId}/domains/${encodeURIComponent(domain)}${teamQuery()}`,
      { headers: authHeaders() }
    );
    if (res.status === 404) return { attached: false, verified: false };
    if (!res.ok) return null;
    const body = (await res.json().catch(() => null)) as {
      verified?: boolean;
    } | null;
    if (!body) return null;
    return { attached: true, verified: body.verified !== false };
  } catch {
    return null;
  }
}
