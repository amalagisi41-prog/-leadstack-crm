import { NextResponse } from "next/server";

import { requireUid } from "@/lib/comms/route-auth";
import { endCallViaControl } from "@/lib/comms/voice/vapi";

export const dynamic = "force-dynamic";

type Body = { controlUrl?: string };

/**
 * End an in-progress test call via its Vapi control URL (returned when the
 * test call was placed). Auth-gated, and the URL is validated to be a Vapi
 * host so this can't be turned into an open SSRF proxy.
 */
export async function POST(request: Request) {
  const auth = requireUid(request);
  if (auth instanceof NextResponse) return auth;

  let payload: Body;
  try {
    payload = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const controlUrl = payload.controlUrl?.trim();
  if (!controlUrl) {
    return NextResponse.json(
      { error: "controlUrl is required" },
      { status: 400 },
    );
  }

  let host: string;
  try {
    const u = new URL(controlUrl);
    host = u.hostname;
    if (u.protocol !== "https:") throw new Error("not https");
  } catch {
    return NextResponse.json({ error: "Invalid control URL" }, { status: 400 });
  }
  // SSRF guard — only ever POST to a Vapi-owned host.
  if (!(host === "vapi.ai" || host.endsWith(".vapi.ai"))) {
    return NextResponse.json(
      { error: "Control URL must be a Vapi host" },
      { status: 400 },
    );
  }

  try {
    await endCallViaControl(controlUrl);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to end call";
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
