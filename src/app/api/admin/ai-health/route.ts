import "server-only";

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { defaultAiModel } from "@/lib/comms/ai/openrouter";
import { firecrawlIsConfigured } from "@/lib/firecrawl/client";
import { configuredReaderApiKey } from "@/lib/business-profile/read-public-page";

/**
 * What the deployed runtime actually sees.
 *
 * Written because a day went into inferring it. AI stopped working across
 * every workspace at once; the OpenRouter dashboard showed credit available,
 * no key ever used, and no request ever billed — three facts that cannot all
 * be true of the key the app is really sending. The value in the hosting
 * environment is write-only once set, and the provider will not show a key
 * again after creation, so neither end could be read directly and the only
 * remaining move was to rotate a production credential to find out.
 *
 * This asks the runtime instead. It reports the fingerprint of the key the
 * deployment holds, and what the provider says about that specific key — its
 * own spend limit, and the balance of whatever account owns it. Comparing
 * those numbers against the dashboard settles in one request whether the
 * deployment is pointed where you think it is.
 *
 * Admin only, and the key is never returned — only enough of it to match
 * against a row on the provider's key list.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const PROBE_TIMEOUT_MS = 10_000;

interface Probe {
  ok: boolean;
  status: number;
  data?: Record<string, unknown>;
  error?: string;
}

async function probe(path: string, key: string): Promise<Probe> {
  try {
    const res = await fetch(`https://openrouter.ai/api/v1${path}`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    const text = await res.text().catch(() => "");
    let json: unknown = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* provider or proxy returned non-JSON */
    }
    if (json && typeof json === "object") {
      const data = (json as { data?: Record<string, unknown> }).data;
      return {
        ok: res.ok,
        status: res.status,
        data: data ?? (json as Record<string, unknown>),
      };
    }
    return {
      ok: false,
      status: res.status,
      error: text.slice(0, 200) || res.statusText,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function GET(request: Request) {
  const access = await requireAdmin(request);
  if (access instanceof NextResponse) return access;

  const key = process.env.OPENROUTER_API_KEY?.trim() ?? "";
  const reader = configuredReaderApiKey();

  const environment = {
    openRouterKeySet: key.length > 0,
    // Enough to match a row on the provider's key list, useless as a
    // credential. A key that differs from every row you can see is the
    // finding this endpoint exists to produce.
    keyFingerprint: key ? `${key.slice(0, 12)}…${key.slice(-4)}` : null,
    keyLength: key.length || null,
    // A value pasted with a stray newline or quote fails in ways that look
    // like an outage, and is invisible in the hosting UI.
    keyLooksMalformed: key ? !/^sk-or-[A-Za-z0-9._-]+$/.test(key) : null,
    model: defaultAiModel(),
    firecrawlConfigured: firecrawlIsConfigured(),
    jinaReaderKeySet: reader.value.length > 0,
    jinaReaderKeyLooksMalformed: reader.value ? !/^jina_[A-Za-z0-9_-]+$/.test(reader.value) : null,
    jinaReaderKeySource: reader.source,
    vercelEnv: process.env.VERCEL_ENV ?? null,
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
  };

  if (!key) {
    return NextResponse.json({
      environment,
      verdict:
        "OPENROUTER_API_KEY is not set on this deployment. Every AI feature is off.",
    });
  }

  const [keyProbe, creditsProbe] = await Promise.all([
    probe("/key", key),
    probe("/credits", key),
  ]);

  const k = keyProbe.data ?? {};
  const c = creditsProbe.data ?? {};
  const purchased = typeof c.total_credits === "number" ? c.total_credits : null;
  const spent = typeof c.total_usage === "number" ? c.total_usage : null;
  const remaining =
    purchased !== null && spent !== null ? purchased - spent : null;
  const limit = typeof k.limit === "number" ? k.limit : null;
  const limitRemaining =
    typeof k.limit_remaining === "number" ? k.limit_remaining : null;

  let verdict: string;
  if (keyProbe.status === 401 || keyProbe.status === 403) {
    verdict =
      "The provider rejects this key. It was deleted, revoked, or the stored value is wrong — not a billing problem.";
  } else if (!keyProbe.ok && keyProbe.status === 0) {
    verdict = `Could not reach the provider from this deployment: ${keyProbe.error}`;
  } else if (limitRemaining !== null && limitRemaining <= 0) {
    verdict =
      "This key's own spend limit is exhausted, even though the account may still hold credit. Raise or clear the limit on this key.";
  } else if (remaining !== null && remaining <= 0) {
    verdict = "The account that owns this key has no credit left.";
  } else if (remaining !== null) {
    verdict = `$${remaining.toFixed(
      2
    )} is available to this key. Compare 'purchased' and 'spent' against the dashboard — if they disagree, this deployment is pointed at a different account or workspace than the one you are looking at.`;
  } else {
    verdict =
      "The provider answered but did not report a balance. See the raw fields below.";
  }

  return NextResponse.json({
    environment,
    key: {
      label: k.label ?? null,
      usage: typeof k.usage === "number" ? k.usage : null,
      limit,
      limitRemaining,
      isFreeTier: k.is_free_tier ?? null,
      probeStatus: keyProbe.status,
      probeError: keyProbe.error ?? null,
    },
    account: {
      purchased,
      spent,
      remaining,
      probeStatus: creditsProbe.status,
      probeError: creditsProbe.error ?? null,
    },
    verdict,
  });
}
