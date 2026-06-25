import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { getChannelConfig } from "@/lib/comms/ai/agent";
import { checkAndCount } from "@/lib/comms/web-chat/rate-limit";
import { isValidSessionId } from "@/lib/comms/web-chat/session";
import { respondToWebChat } from "@/lib/comms/web-chat/respond";
import { ipFromRequest } from "@/lib/contacts/location";
import type { SubAccountDoc } from "@/types";

export const dynamic = "force-dynamic";

/**
 * Public POST endpoint the widget hits on every visitor message.
 *
 * NB: this endpoint deliberately does NOT origin-check against the
 * channel's allowedDomains. The iframe that calls this lives on
 * LeadStack's own domain — so the Origin header always equals our own
 * host, not the client's site. The domain allowlist is enforced at
 * /api/web-chat/config instead: widget.js calls /config from the
 * parent-page context (where the Origin header DOES reflect the client
 * site), so a competitor can't load the widget on an unauthorized
 * domain. /message is gated by saId existing, the channel being
 * enabled, per-IP + per-session rate limits, and per-channel token
 * budgets. A motivated attacker who knows a saId could call /message
 * directly, but rate limits + token caps make abuse uneconomical.
 *
 * Failures return CORS headers so the widget doesn't choke on a console
 * CORS error — the visitor sees a generic fallback instead.
 */

const MAX_MESSAGE_CHARS = 2000;

function corsHeaders(origin: string | null): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin ?? "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export async function OPTIONS(request: Request) {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(request.headers.get("origin")),
  });
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  const headers = corsHeaders(origin);

  let body: {
    sa?: string;
    sessionId?: string;
    message?: string;
    pageUrl?: string;
    referrer?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON" },
      { status: 400, headers },
    );
  }

  const subAccountId = body.sa?.trim();
  const sessionId = body.sessionId?.trim();
  const message = body.message?.trim();

  if (!subAccountId) {
    return NextResponse.json(
      { error: "Missing sa" },
      { status: 400, headers },
    );
  }
  if (!isValidSessionId(sessionId)) {
    return NextResponse.json(
      { error: "Invalid sessionId" },
      { status: 400, headers },
    );
  }
  if (!message || message.length > MAX_MESSAGE_CHARS) {
    return NextResponse.json(
      { error: `Message must be 1-${MAX_MESSAGE_CHARS} characters` },
      { status: 400, headers },
    );
  }

  // Channel-enabled check. Origin allowlist is enforced at /config
  // (see file-level comment) — not here.
  const config = await getChannelConfig(subAccountId, "web-chat");
  if (!config || !config.enabled || !config.webChat) {
    return NextResponse.json(
      { enabled: false, error: "Web Chat is not enabled for this sub-account" },
      { status: 403, headers },
    );
  }

  // Rate limit (after auth — don't waste IP budget on rejected requests).
  const ip = ipFromRequest(request) ?? "unknown";
  const rl = checkAndCount(ip, sessionId);
  if (!rl.ok) {
    return NextResponse.json(
      {
        error:
          rl.reason === "session-quota"
            ? "Session message limit reached"
            : "Too many requests — try again in a bit",
      },
      {
        status: 429,
        headers: { ...headers, "Retry-After": String(rl.retryAfterSec) },
      },
    );
  }

  // Need agencyId for tenancy stamps on the session/messages.
  const saSnap = await getAdminDb().doc(`subAccounts/${subAccountId}`).get();
  if (!saSnap.exists) {
    return NextResponse.json(
      { error: "Sub-account not found" },
      { status: 404, headers },
    );
  }
  const sa = saSnap.data() as SubAccountDoc;

  try {
    const { outcome } = await respondToWebChat({
      subAccountId,
      agencyId: sa.agencyId,
      sessionId,
      incomingMessage: message,
      pageUrl: body.pageUrl?.slice(0, 500) ?? null,
      referrer: body.referrer?.slice(0, 500) ?? null,
      origin,
      visitorIp: ip,
      visitorUserAgent: request.headers.get("user-agent")?.slice(0, 500) ?? null,
    });

    const visibleReply =
      outcome.kind === "replied"
        ? outcome.replyText
        : outcome.kind === "escalated"
          ? outcome.fallbackReply
          : outcome.fallbackReply;
    const formFields =
      outcome.kind === "replied" ? outcome.formFields : null;

    return NextResponse.json(
      {
        reply: visibleReply,
        kind: outcome.kind,
        formFields,
      },
      { status: 200, headers },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error(`[web-chat/message] sa=${subAccountId} failed:`, msg);
    return NextResponse.json(
      {
        reply:
          "Sorry — something went wrong on our end. The team has been notified.",
        kind: "skipped",
      },
      { status: 200, headers },
    );
  }
}
