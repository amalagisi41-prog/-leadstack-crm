import { NextResponse } from "next/server";
import { getChannelConfig } from "@/lib/comms/ai/agent";
import { checkOriginAllowed } from "@/lib/comms/web-chat/origin";
import { DEFAULT_WEB_CHAT_CONFIG } from "@/types/ai";

export const dynamic = "force-dynamic";

/**
 * Public endpoint hit by the widget loader on every page-load to fetch
 * theme + welcome message + enabled state. Validates the Origin header
 * against the channel's allowedDomains list — when the origin isn't
 * allowed we still return 200 with `{ enabled: false }` so the loader
 * silently disables itself instead of throwing a CORS error in the
 * page's console (which would alarm the buyer's client).
 *
 * Always returns CORS headers since the widget calls this from the host
 * page's origin.
 */

function corsHeaders(origin: string | null): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin ?? "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
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

export async function GET(request: Request) {
  const url = new URL(request.url);
  const subAccountId = url.searchParams.get("sa");
  const origin = request.headers.get("origin");
  const headers = corsHeaders(origin);

  if (!subAccountId) {
    return NextResponse.json(
      { error: "Missing sa param" },
      { status: 400, headers },
    );
  }

  const config = await getChannelConfig(subAccountId, "web-chat");
  if (!config || !config.enabled || !config.webChat) {
    return NextResponse.json(
      { enabled: false },
      { status: 200, headers },
    );
  }

  const originCheck = checkOriginAllowed(origin, config.webChat.allowedDomains);
  if (!originCheck.allowed) {
    return NextResponse.json(
      { enabled: false, reason: originCheck.reason },
      { status: 200, headers },
    );
  }

  // Backward-safe: if any of the web-chat fields are missing on the doc
  // (older docs created before defaults shipped), fall back to defaults.
  return NextResponse.json(
    {
      enabled: true,
      welcomeMessage:
        config.webChat.welcomeMessage || DEFAULT_WEB_CHAT_CONFIG.welcomeMessage,
      accentColor:
        config.webChat.accentColor || DEFAULT_WEB_CHAT_CONFIG.accentColor,
      position: config.webChat.position || DEFAULT_WEB_CHAT_CONFIG.position,
    },
    { status: 200, headers },
  );
}
