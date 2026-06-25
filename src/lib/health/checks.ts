import "server-only";

import { getAdminDb } from "@/lib/firebase/admin";

/**
 * Agency-level health checks. Each integration runs its presence test
 * (env vars set?) and, where cheap, a live-ping (auth round-trip to the
 * provider) to confirm the credentials still work. Each check is wrapped
 * in a 3s timeout and never throws — failures are reported as structured
 * status entries the UI can render.
 */

export type HealthStatus =
  | "ok"
  | "partial"
  | "missing"
  | "error"
  | "skipped";

export interface SubCheck {
  label: string;
  status: HealthStatus;
  detail?: string;
}

export interface IntegrationHealth {
  id: string;
  label: string;
  category:
    | "core"
    | "billing"
    | "comms"
    | "ai-agents"
    | "automations"
    | "website"
    | "leads";
  status: HealthStatus;
  message: string;
  subChecks: SubCheck[];
  /** True when the app can't boot without this integration. */
  required: boolean;
}

const TIMEOUT_MS = 3000;

function envPresent(...keys: string[]): { ok: boolean; missing: string[] } {
  const missing = keys.filter((k) => !process.env[k]?.trim());
  return { ok: missing.length === 0, missing };
}

function rollup(subs: SubCheck[]): HealthStatus {
  if (subs.length === 0) return "skipped";
  if (subs.some((s) => s.status === "error")) return "error";
  if (subs.some((s) => s.status === "missing")) return "missing";
  if (subs.some((s) => s.status === "partial")) return "partial";
  const live = subs.filter((s) => s.status !== "skipped");
  if (live.length === 0) return "skipped";
  return live.every((s) => s.status === "ok") ? "ok" : "partial";
}

function rollupMessage(status: HealthStatus, label: string): string {
  switch (status) {
    case "ok":
      return `${label} configured and reachable.`;
    case "partial":
      return `${label} partially configured — see details.`;
    case "missing":
      return `${label} not configured.`;
    case "error":
      return `${label} returned an error during the live check.`;
    case "skipped":
      return `${label} not checked.`;
  }
}

async function withTimeout<T>(
  fn: () => Promise<T>,
  label: string,
): Promise<{ result?: T; error?: string }> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      return { result: await fn() };
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : `${label} threw a non-Error value`,
    };
  }
}

// ---------------------------------------------------------------------------
// Core: Firebase Client + Admin + cookies + app URL + bootstrap email

async function checkFirebaseClient(): Promise<IntegrationHealth> {
  const keys = [
    "NEXT_PUBLIC_FIREBASE_API_KEY",
    "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
    "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
    "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
    "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
    "NEXT_PUBLIC_FIREBASE_APP_ID",
  ];
  const presence = envPresent(...keys);
  const subChecks: SubCheck[] = keys.map((k) => ({
    label: k,
    status: process.env[k]?.trim() ? "ok" : "missing",
  }));
  const status: HealthStatus = presence.ok ? "ok" : "missing";
  return {
    id: "firebase-client",
    label: "Firebase (Client SDK)",
    category: "core",
    required: true,
    status,
    message: presence.ok
      ? "All client SDK env vars present."
      : `${presence.missing.length} client env var(s) missing.`,
    subChecks,
  };
}

async function checkFirebaseAdmin(): Promise<IntegrationHealth> {
  const keys = [
    "FIREBASE_ADMIN_PROJECT_ID",
    "FIREBASE_ADMIN_CLIENT_EMAIL",
    "FIREBASE_ADMIN_PRIVATE_KEY",
  ];
  const presence = envPresent(...keys);
  const subChecks: SubCheck[] = keys.map((k) => ({
    label: k,
    status: process.env[k]?.trim() ? "ok" : "missing",
  }));

  if (presence.ok) {
    const ping = await withTimeout(async () => {
      const db = getAdminDb();
      // Cheap doc read; existence not required.
      await db.collection("appConfig").doc("main").get();
      return true;
    }, "Firestore ping");

    if (ping.error) {
      subChecks.push({
        label: "Firestore admin ping",
        status: "error",
        detail: ping.error,
      });
    } else {
      subChecks.push({ label: "Firestore admin ping", status: "ok" });
    }
  } else {
    subChecks.push({
      label: "Firestore admin ping",
      status: "skipped",
      detail: "Skipped — env vars missing.",
    });
  }

  const status = rollup(subChecks);
  return {
    id: "firebase-admin",
    label: "Firebase Admin SDK + Firestore",
    category: "core",
    required: true,
    status,
    message: rollupMessage(status, "Firebase Admin"),
    subChecks,
  };
}

async function checkAppCore(): Promise<IntegrationHealth> {
  const subChecks: SubCheck[] = [
    {
      label: "NEXT_PUBLIC_APP_URL",
      status: process.env.NEXT_PUBLIC_APP_URL?.trim() ? "ok" : "missing",
      detail: process.env.NEXT_PUBLIC_APP_URL,
    },
    {
      label: "BOOTSTRAP_ADMIN_EMAIL",
      status: process.env.BOOTSTRAP_ADMIN_EMAIL?.trim() ? "ok" : "missing",
      detail: process.env.BOOTSTRAP_ADMIN_EMAIL
        ? `Will gate first signup. Once an admin claims, this is ignored.`
        : undefined,
    },
    {
      label: "COOKIE_SECRET_CURRENT",
      status: process.env.COOKIE_SECRET_CURRENT?.trim() ? "ok" : "missing",
    },
    {
      label: "COOKIE_SECRET_PREVIOUS",
      status: process.env.COOKIE_SECRET_PREVIOUS?.trim() ? "ok" : "missing",
    },
  ];
  const status = rollup(subChecks);
  return {
    id: "app-core",
    label: "App core",
    category: "core",
    required: true,
    status,
    message: rollupMessage(status, "App core"),
    subChecks,
  };
}

// ---------------------------------------------------------------------------
// Stripe

async function checkStripe(): Promise<IntegrationHealth> {
  const keys = [
    "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "STRIPE_PRO_PRICE_ID",
  ];
  const presence = envPresent(...keys);
  const subChecks: SubCheck[] = keys.map((k) => ({
    label: k,
    status: process.env[k]?.trim() ? "ok" : "missing",
  }));

  if (presence.ok) {
    const ping = await withTimeout(async () => {
      const Stripe = (await import("stripe")).default;
      const client = new Stripe(process.env.STRIPE_SECRET_KEY!);
      // Confirm the key is live + has read scope.
      await client.balance.retrieve();
      // Confirm the price exists.
      await client.prices.retrieve(process.env.STRIPE_PRO_PRICE_ID!);
      return true;
    }, "Stripe ping");
    subChecks.push(
      ping.error
        ? {
            label: "Live API ping",
            status: "error",
            detail: ping.error,
          }
        : { label: "Live API ping", status: "ok" },
    );
  } else {
    subChecks.push({
      label: "Live API ping",
      status: "skipped",
      detail: "Skipped — env vars missing.",
    });
  }

  const status = rollup(subChecks);
  return {
    id: "stripe",
    label: "Stripe (Billing)",
    category: "billing",
    required: false,
    status,
    message: rollupMessage(status, "Stripe"),
    subChecks,
  };
}

// ---------------------------------------------------------------------------
// Resend (Email)

function extractDomain(emailFrom: string | undefined): string | null {
  if (!emailFrom) return null;
  // Accepts "Name <user@domain.com>" or "user@domain.com"
  const match = emailFrom.match(/[^\s<>]+@([^\s<>]+)/);
  return match?.[1] ?? null;
}

async function checkResend(): Promise<IntegrationHealth> {
  const keys = ["RESEND_API_KEY", "EMAIL_FROM"];
  const presence = envPresent(...keys);
  const subChecks: SubCheck[] = keys.map((k) => ({
    label: k,
    status: process.env[k]?.trim() ? "ok" : "missing",
  }));

  const fromDomain = extractDomain(process.env.EMAIL_FROM);

  if (presence.ok && process.env.RESEND_API_KEY) {
    const ping = await withTimeout(async () => {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
      try {
        const r = await fetch("https://api.resend.com/domains", {
          headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
          signal: ctrl.signal,
        });
        if (!r.ok) {
          throw new Error(`Resend /domains returned ${r.status}`);
        }
        const body = (await r.json()) as {
          data?: { name: string; status: string }[];
        };
        return body.data ?? [];
      } finally {
        clearTimeout(t);
      }
    }, "Resend ping");

    if (ping.error) {
      subChecks.push({
        label: "API key valid",
        status: "error",
        detail: ping.error,
      });
    } else {
      subChecks.push({ label: "API key valid", status: "ok" });
      if (fromDomain && fromDomain !== "resend.dev") {
        const match = ping.result?.find(
          (d) => d.name.toLowerCase() === fromDomain.toLowerCase(),
        );
        if (!match) {
          subChecks.push({
            label: `Sender domain "${fromDomain}" verified`,
            status: "missing",
            detail:
              "EMAIL_FROM domain isn't registered in Resend. Add it under Domains.",
          });
        } else if (match.status !== "verified") {
          subChecks.push({
            label: `Sender domain "${fromDomain}" verified`,
            status: "partial",
            detail: `Resend reports status: ${match.status}. Sends will fail until DNS propagates.`,
          });
        } else {
          subChecks.push({
            label: `Sender domain "${fromDomain}" verified`,
            status: "ok",
          });
        }
      } else if (fromDomain === "resend.dev") {
        subChecks.push({
          label: "Sender domain",
          status: "partial",
          detail:
            "Using Resend's sandbox domain — fine for testing, untrusted in production.",
        });
      }
    }
  } else {
    subChecks.push({
      label: "Live API ping",
      status: "skipped",
      detail: "Skipped — env vars missing.",
    });
  }

  const status = rollup(subChecks);
  return {
    id: "resend",
    label: "Resend (Email)",
    category: "comms",
    required: false,
    status,
    message: rollupMessage(status, "Resend"),
    subChecks,
  };
}

// ---------------------------------------------------------------------------
// Twilio (SMS) — creds + inbound webhook URL on the from-number

async function checkTwilio(): Promise<IntegrationHealth> {
  const keys = ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM_NUMBER"];
  const presence = envPresent(...keys);
  const subChecks: SubCheck[] = keys.map((k) => ({
    label: k,
    status: process.env[k]?.trim() ? "ok" : "missing",
  }));

  if (presence.ok) {
    const sid = process.env.TWILIO_ACCOUNT_SID!;
    const token = process.env.TWILIO_AUTH_TOKEN!;
    const fromNumber = process.env.TWILIO_FROM_NUMBER!;
    const auth = Buffer.from(`${sid}:${token}`).toString("base64");

    const ping = await withTimeout(async () => {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
      try {
        const r = await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${sid}.json`,
          {
            headers: { Authorization: `Basic ${auth}` },
            signal: ctrl.signal,
          },
        );
        if (!r.ok) {
          throw new Error(`Twilio /Accounts returned ${r.status}`);
        }
        return true;
      } finally {
        clearTimeout(t);
      }
    }, "Twilio ping");

    if (ping.error) {
      subChecks.push({
        label: "Credentials valid",
        status: "error",
        detail: ping.error,
      });
    } else {
      subChecks.push({ label: "Credentials valid", status: "ok" });

      // Inbound webhook URL probe — fetch the from-number's config and
      // confirm sms_url points at /api/webhooks/twilio/inbound under our
      // public URL.
      const webhookProbe = await withTimeout(async () => {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
        try {
          const r = await fetch(
            `https://api.twilio.com/2010-04-01/Accounts/${sid}/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(fromNumber)}`,
            {
              headers: { Authorization: `Basic ${auth}` },
              signal: ctrl.signal,
            },
          );
          if (!r.ok) {
            throw new Error(`Twilio IncomingPhoneNumbers returned ${r.status}`);
          }
          const body = (await r.json()) as {
            incoming_phone_numbers?: { sms_url?: string }[];
          };
          return body.incoming_phone_numbers?.[0]?.sms_url ?? "";
        } finally {
          clearTimeout(t);
        }
      }, "Twilio inbound webhook probe");

      if (webhookProbe.error) {
        subChecks.push({
          label: "Inbound webhook URL",
          status: "error",
          detail: webhookProbe.error,
        });
      } else {
        const expectedSuffix = "/api/webhooks/twilio/inbound";
        const expected = `${(process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "")}${expectedSuffix}`;
        const actual = webhookProbe.result?.trim() ?? "";
        if (!actual) {
          subChecks.push({
            label: "Inbound webhook URL",
            status: "missing",
            detail:
              "No 'A MESSAGE COMES IN' webhook configured on the from-number. STOP/START opt-out won't work until set.",
          });
        } else if (actual === expected) {
          subChecks.push({ label: "Inbound webhook URL", status: "ok" });
        } else {
          subChecks.push({
            label: "Inbound webhook URL",
            status: "partial",
            detail: `Twilio is POSTing to ${actual} — expected ${expected}.`,
          });
        }
      }
    }
  } else {
    subChecks.push({
      label: "Live API ping",
      status: "skipped",
      detail: "Skipped — env vars missing.",
    });
  }

  // Informational only — surface the Twilio↔WhatsApp link without
  // implying this agency-level env check covers it. Dedicated SMS +
  // WhatsApp run off each sub-account's OWN Twilio creds (Settings → SMS)
  // plus a per-SA WhatsApp sender + the whatsappEnabledByAgency gate —
  // none of which are deployment env vars, so they're verified per
  // sub-account, not here. Always "skipped" so it never affects the
  // traffic light.
  subChecks.push({
    label: "Dedicated SMS + WhatsApp",
    status: "skipped",
    detail:
      "Configured per sub-account (each sub-account's own Twilio creds + WhatsApp sender, behind the agency WhatsApp gate) — not covered by this agency-level check.",
  });

  const status = rollup(subChecks);
  return {
    id: "twilio",
    label: "Twilio (SMS)",
    category: "comms",
    required: false,
    status,
    message: rollupMessage(status, "Twilio"),
    subChecks,
  };
}

// ---------------------------------------------------------------------------
// QStash + Automations secret

async function checkQstash(): Promise<IntegrationHealth> {
  const keys = [
    "QSTASH_URL",
    "QSTASH_TOKEN",
    "QSTASH_CURRENT_SIGNING_KEY",
    "QSTASH_NEXT_SIGNING_KEY",
  ];
  const presence = envPresent(...keys);
  const subChecks: SubCheck[] = keys.map((k) => ({
    label: k,
    status: process.env[k]?.trim() ? "ok" : "missing",
  }));

  if (presence.ok) {
    const ping = await withTimeout(async () => {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
      try {
        const base = process.env.QSTASH_URL!.replace(/\/$/, "");
        const r = await fetch(`${base}/v2/topics`, {
          headers: { Authorization: `Bearer ${process.env.QSTASH_TOKEN}` },
          signal: ctrl.signal,
        });
        if (!r.ok) {
          throw new Error(`QStash /v2/topics returned ${r.status}`);
        }
        return true;
      } finally {
        clearTimeout(t);
      }
    }, "QStash ping");
    subChecks.push(
      ping.error
        ? { label: "Token + URL reachable", status: "error", detail: ping.error }
        : { label: "Token + URL reachable", status: "ok" },
    );
  } else {
    subChecks.push({
      label: "Live API ping",
      status: "skipped",
      detail: "Skipped — env vars missing.",
    });
  }

  const status = rollup(subChecks);
  return {
    id: "qstash",
    label: "Upstash QStash",
    category: "automations",
    required: false,
    status,
    message: rollupMessage(status, "QStash"),
    subChecks,
  };
}

async function checkAutomationsSecret(): Promise<IntegrationHealth> {
  const ok = !!process.env.AUTOMATIONS_TOKEN_SECRET?.trim();
  const subChecks: SubCheck[] = [
    {
      label: "AUTOMATIONS_TOKEN_SECRET",
      status: ok ? "ok" : "missing",
      detail: ok
        ? "Used to HMAC-sign unsubscribe links. Rotating invalidates outstanding links."
        : "Generate with: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"",
    },
  ];
  return {
    id: "automations-secret",
    label: "Automations token secret",
    category: "automations",
    required: false,
    status: ok ? "ok" : "missing",
    message: ok
      ? "Unsubscribe HMAC secret configured."
      : "Unsubscribe HMAC secret missing — links would fail to verify.",
    subChecks,
  };
}

// ---------------------------------------------------------------------------
// gitpage.site (presence + format only — no documented health endpoint)

async function checkGitpage(): Promise<IntegrationHealth> {
  const key = process.env.GITPAGE_API_KEY?.trim();
  const subChecks: SubCheck[] = [];

  if (!key) {
    subChecks.push({
      label: "GITPAGE_API_KEY",
      status: "missing",
      detail: "Required for the website builder.",
    });
  } else {
    const formatOk = /^gp_[a-f0-9]{16,}/.test(key);
    subChecks.push({
      label: "GITPAGE_API_KEY",
      status: formatOk ? "ok" : "partial",
      detail: formatOk
        ? undefined
        : "Key doesn't match the expected `gp_<hex>` format. Double-check you copied it correctly.",
    });
  }

  const url = process.env.GITPAGE_API_URL?.trim();
  subChecks.push({
    label: "GITPAGE_API_URL",
    status: url ? "ok" : "skipped",
    detail: url
      ? url
      : "Optional. Defaults to https://www.gitpage.site if unset.",
  });

  const status = rollup(subChecks);
  return {
    id: "gitpage",
    label: "gitpage.site (Website builder)",
    category: "website",
    required: false,
    status,
    message: rollupMessage(status, "gitpage"),
    subChecks,
  };
}

// ---------------------------------------------------------------------------
// Mapbox (Leads map) — public token format + live API ping

async function checkMapbox(): Promise<IntegrationHealth> {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN?.trim();
  const subChecks: SubCheck[] = [];

  if (!token) {
    subChecks.push({
      label: "NEXT_PUBLIC_MAPBOX_TOKEN",
      status: "missing",
      detail: "Without this the dashboard leads-map card renders a 'not configured' message.",
    });
    return {
      id: "mapbox",
      label: "Mapbox (Leads map)",
      category: "leads",
      required: false,
      status: "missing",
      message: rollupMessage("missing", "Mapbox"),
      subChecks,
    };
  }

  // Format sanity — public scoped tokens start with `pk.`. Secret keys
  // (`sk.`) work for API calls but never belong in NEXT_PUBLIC_ env vars
  // because they're shipped to the browser.
  const formatOk = token.startsWith("pk.");
  subChecks.push({
    label: "NEXT_PUBLIC_MAPBOX_TOKEN",
    status: formatOk ? "ok" : "partial",
    detail: formatOk
      ? undefined
      : token.startsWith("sk.")
        ? "Secret token (sk.*) detected. NEVER put a secret token in NEXT_PUBLIC_* — it's shipped to every client. Use a public token (pk.*)."
        : "Token doesn't start with `pk.` — Mapbox public tokens have that prefix.",
  });

  const ping = await withTimeout(async () => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      // Tiny tile request — validates the token and that it has the
      // styles:tiles scope (default on new public tokens).
      const r = await fetch(
        `https://api.mapbox.com/styles/v1/mapbox/light-v11?access_token=${encodeURIComponent(token)}`,
        { signal: ctrl.signal },
      );
      if (r.status === 401) throw new Error("Token rejected (401).");
      if (!r.ok) throw new Error(`Mapbox styles API returned ${r.status}`);
      return true;
    } finally {
      clearTimeout(t);
    }
  }, "Mapbox ping");

  subChecks.push(
    ping.error
      ? { label: "Token valid (live API ping)", status: "error", detail: ping.error }
      : { label: "Token valid (live API ping)", status: "ok" },
  );

  const status = rollup(subChecks);
  return {
    id: "mapbox",
    label: "Mapbox (Leads map)",
    category: "leads",
    required: false,
    status,
    message: rollupMessage(status, "Mapbox"),
    subChecks,
  };
}

// ---------------------------------------------------------------------------
// OpenRouter — powers the AI Agents bot replies across every channel
// (SMS, Web Chat). Without this the AI Agents settings still render but
// the bot stays silent.

async function checkOpenRouter(): Promise<IntegrationHealth> {
  const key = process.env.OPENROUTER_API_KEY?.trim();
  const subChecks: SubCheck[] = [
    {
      label: "OPENROUTER_API_KEY",
      status: key ? "ok" : "missing",
      detail: key
        ? undefined
        : "Required for AI Agents bot replies. Get one at https://openrouter.ai.",
    },
  ];

  if (key) {
    const ping = await withTimeout(async () => {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
      try {
        // /api/v1/models is a cheap auth-checked endpoint.
        const r = await fetch("https://openrouter.ai/api/v1/models", {
          headers: { Authorization: `Bearer ${key}` },
          signal: ctrl.signal,
        });
        if (r.status === 401)
          throw new Error("OpenRouter rejected the key (401).");
        if (!r.ok) throw new Error(`OpenRouter /models returned ${r.status}`);
        return true;
      } finally {
        clearTimeout(t);
      }
    }, "OpenRouter ping");

    subChecks.push(
      ping.error
        ? {
            label: "API key valid (live ping)",
            status: "error",
            detail: ping.error,
          }
        : { label: "API key valid (live ping)", status: "ok" },
    );

    // Optional default-model var. Informational only — null means the
    // hard-coded default (Haiku 4.5) is used.
    const defaultModel = process.env.AI_REPLIES_DEFAULT_MODEL?.trim();
    subChecks.push({
      label: "AI_REPLIES_DEFAULT_MODEL",
      status: defaultModel ? "ok" : "skipped",
      detail: defaultModel
        ? defaultModel
        : "Optional. Defaults to anthropic/claude-haiku-4-5 when unset.",
    });
  }

  const status = rollup(subChecks);
  return {
    id: "openrouter",
    label: "OpenRouter (AI Agents)",
    category: "ai-agents",
    required: false,
    status,
    message: rollupMessage(status, "OpenRouter"),
    subChecks,
  };
}

// ---------------------------------------------------------------------------
// Firecrawl — powers the website KB scrape on the AI Agent profile.
// Optional. Without it the "Refresh KB" button on the Overview returns
// 503 with a friendly message; bot replies still work but without
// website context.

async function checkFirecrawl(): Promise<IntegrationHealth> {
  const key = process.env.FIRECRAWL_API_KEY?.trim();
  const subChecks: SubCheck[] = [];

  if (!key) {
    subChecks.push({
      label: "FIRECRAWL_API_KEY",
      status: "missing",
      detail:
        "Optional. When set, AI Agents → Overview → 'Refresh KB' scrapes the sub-account's website and feeds it to the bot as context.",
    });
    return {
      id: "firecrawl",
      label: "Firecrawl (Website KB)",
      category: "ai-agents",
      required: false,
      status: "missing",
      message: rollupMessage("missing", "Firecrawl"),
      subChecks,
    };
  }

  const formatOk = /^fc-[a-z0-9]{16,}/i.test(key);
  subChecks.push({
    label: "FIRECRAWL_API_KEY",
    status: formatOk ? "ok" : "partial",
    detail: formatOk
      ? undefined
      : "Key doesn't match expected `fc-<hex>` format. Double-check you copied it correctly.",
  });

  // No live ping — Firecrawl charges per request and has no documented
  // free auth-check endpoint. Format + presence is the best we can do
  // without spending the buyer's credits on every Status refresh.

  const status = rollup(subChecks);
  return {
    id: "firecrawl",
    label: "Firecrawl (Website KB)",
    category: "ai-agents",
    required: false,
    status,
    message: rollupMessage(status, "Firecrawl"),
    subChecks,
  };
}

// ---------------------------------------------------------------------------
// Vapi — powers the AI Voice Agent channel. Optional. Without it the
// AI Agents → Voice settings page renders but enable returns 503.
// SMS / Web Chat channels are unaffected.

async function checkVapi(): Promise<IntegrationHealth> {
  const apiKey = process.env.VAPI_API_KEY?.trim();
  const webhookSecret = process.env.VAPI_WEBHOOK_SECRET?.trim();
  const subChecks: SubCheck[] = [
    {
      label: "VAPI_API_KEY",
      status: apiKey ? "ok" : "missing",
      detail: apiKey
        ? undefined
        : "Required to provision Vapi assistants for the Voice channel. Get one at https://vapi.ai → API Keys (Private).",
    },
    {
      label: "VAPI_WEBHOOK_SECRET",
      status: webhookSecret ? "ok" : "missing",
      detail: webhookSecret
        ? "Sent to Vapi as part of the LLM/EOC webhook URLs (?s=…); rotated by changing this value and re-saving every active voice channel."
        : "Generate locally: openssl rand -base64 32. We embed it in the URLs we register with Vapi; our routes verify it on every callback.",
    },
  ];

  // App URL is a hard prerequisite — without it our provisioning code
  // throws before any Vapi round-trip ("Vapi must reach our LLM
  // endpoint"). Surface it here so the Status page makes the
  // dependency obvious rather than failing inside the channel save.
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  subChecks.push({
    label: "NEXT_PUBLIC_APP_URL reachable",
    status: appUrl ? "ok" : "missing",
    detail: appUrl
      ? `Vapi will POST per-turn LLM webhooks to ${appUrl}/api/webhooks/vapi/llm/[saId]?s=…`
      : "Vapi needs to reach our LLM endpoint. Locally use a cloudflared / ngrok tunnel; in prod set this to your Vercel domain.",
  });

  if (apiKey && webhookSecret) {
    const ping = await withTimeout(async () => {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
      try {
        // GET /assistant is cheap (returns the list) and auth-checked.
        // Confirms the key works without provisioning anything.
        const r = await fetch("https://api.vapi.ai/assistant?limit=1", {
          headers: { Authorization: `Bearer ${apiKey}` },
          signal: ctrl.signal,
        });
        if (r.status === 401)
          throw new Error("Vapi rejected the API key (401).");
        if (!r.ok) throw new Error(`Vapi /assistant returned ${r.status}`);
        return true;
      } finally {
        clearTimeout(t);
      }
    }, "Vapi ping");

    subChecks.push(
      ping.error
        ? {
            label: "API key valid (live ping)",
            status: "error",
            detail: ping.error,
          }
        : { label: "API key valid (live ping)", status: "ok" },
    );
  } else {
    subChecks.push({
      label: "Live API ping",
      status: "skipped",
      detail: "Skipped — env vars missing.",
    });
  }

  const status = rollup(subChecks);
  return {
    id: "vapi",
    label: "Vapi (AI Voice Agent)",
    category: "ai-agents",
    required: false,
    status,
    message: rollupMessage(status, "Vapi"),
    subChecks,
  };
}

// ---------------------------------------------------------------------------
// Meta — ONE Facebook/Instagram app powering BOTH the Messenger + IG DM inbox
// AND the Social Planner (they share one connection / one set of env vars).
// Optional + beta. Per-sub-account agency gates (metaInboxEnabledByAgency,
// socialPlannerEnabledByAgency) + OAuth connect are separate. Without the app
// creds both surfaces stay inert and invisible. There is deliberately no
// second "Meta Social" check — it would test the identical META_APP_ID/SECRET.

async function checkMeta(): Promise<IntegrationHealth> {
  const appId = process.env.META_APP_ID?.trim();
  const appSecret = process.env.META_APP_SECRET?.trim();
  const verifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN?.trim();

  // No app creds → not configured on this deployment. Both the inbox and the
  // Social Planner stay invisible, so report cleanly rather than as an error.
  if (!appId || !appSecret) {
    return {
      id: "meta",
      label: "Meta (Facebook + Instagram)",
      category: "comms",
      required: false,
      status: "missing",
      message: rollupMessage("missing", "Meta"),
      subChecks: [
        {
          label: "META_APP_ID",
          status: appId ? "ok" : "missing",
        },
        {
          label: "META_APP_SECRET",
          status: appSecret ? "ok" : "missing",
          detail:
            "Optional. Both META_APP_ID + META_APP_SECRET power the unified inbox (Messenger + IG DMs) AND the Social Planner — one connection serves both.",
        },
      ],
    };
  }

  const subChecks: SubCheck[] = [
    { label: "META_APP_ID", status: "ok" },
    { label: "META_APP_SECRET", status: "ok" },
  ];

  // Live auth ping using the app access token (`{app-id}|{app-secret}`).
  // Confirms the id + secret pair is valid without any per-Page token.
  const ping = await withTimeout(async () => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const appToken = `${appId}|${appSecret}`;
      const r = await fetch(
        `https://graph.facebook.com/v21.0/${appId}?fields=id&access_token=${encodeURIComponent(appToken)}`,
        { signal: ctrl.signal },
      );
      if (r.status === 400 || r.status === 401) {
        throw new Error("Meta rejected the app credentials (invalid app ID/secret).");
      }
      if (!r.ok) throw new Error(`Meta Graph API returned ${r.status}`);
      return true;
    } finally {
      clearTimeout(t);
    }
  }, "Meta ping");

  subChecks.push(
    ping.error
      ? { label: "App credentials valid (live ping)", status: "error", detail: ping.error }
      : { label: "App credentials valid (live ping)", status: "ok" },
  );

  // Verify token gates the inbound webhook GET handshake — without it Meta
  // can't register the webhook, so no inbound messages flow even though
  // OAuth connect would succeed. INBOX-ONLY — the Social Planner publishes
  // outbound and doesn't need the webhook, so this is "partial" (degraded),
  // not a blocker for posting.
  subChecks.push({
    label: "META_WEBHOOK_VERIFY_TOKEN",
    status: verifyToken ? "ok" : "partial",
    detail: verifyToken
      ? "Echoed during the inbound webhook handshake."
      : "Missing — inbound Messenger/Instagram messages won't reach the INBOX until it's set. The Social Planner (outbound posting) is unaffected.",
  });

  // Informational only — posting permissions can't be verified from env vars.
  // They're per-connection (granted at OAuth, gated by Meta App Review) and
  // shown as capability badges on the Settings → Facebook & Instagram card.
  // Always "skipped" so it never moves the dot.
  subChecks.push({
    label: "Social Planner posting",
    status: "skipped",
    detail:
      "Posting (pages_manage_posts + instagram_content_publish) requires Meta App Review and is granted per-connection — verified by the capability badges on the Settings → Facebook & Instagram card, not by this env-level check.",
  });

  const status = rollup(subChecks);
  return {
    id: "meta",
    label: "Meta (Facebook + Instagram)",
    category: "comms",
    required: false,
    status,
    message: rollupMessage(status, "Meta"),
    subChecks,
  };
}

// ---------------------------------------------------------------------------
// Public entry point

export async function runHealthChecks(): Promise<IntegrationHealth[]> {
  const results = await Promise.all([
    checkAppCore(),
    checkFirebaseClient(),
    checkFirebaseAdmin(),
    checkStripe(),
    checkResend(),
    checkTwilio(),
    checkMeta(),
    checkOpenRouter(),
    checkFirecrawl(),
    checkVapi(),
    checkQstash(),
    checkAutomationsSecret(),
    checkGitpage(),
    checkMapbox(),
  ]);
  return results;
}
