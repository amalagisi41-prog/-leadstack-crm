import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Vapi status webhook. Receives lifecycle events: status-update,
 * speech-update, transfer-destination-request, hang, etc. v1 only
 * persists the headline state (callStarted, callEnded, failed) onto
 * the in-flight `voiceCalls/{callId}` doc so the operator console
 * can later render a "live call" indicator. Anything else is
 * acknowledged + ignored.
 *
 * End-of-call analysis is handled separately by the dedicated
 * /end-of-call endpoint — keeping the two split means a slow
 * analysis pass can't block status updates and vice versa.
 */

interface VapiStatusMessage {
  message?: {
    type?: string;
    status?: string;
    call?: { id?: string };
  };
}

function authorize(request: Request): boolean {
  const expected = process.env.VAPI_WEBHOOK_SECRET?.trim();
  if (!expected) return false;
  // See LLM route's authorize() for why the secret is in the URL.
  const provided = new URL(request.url).searchParams.get("s")?.trim() ?? "";
  return provided.length > 0 && provided === expected;
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ subAccountId: string }> },
) {
  if (!authorize(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { subAccountId } = await ctx.params;

  let body: VapiStatusMessage;
  try {
    body = (await request.json()) as VapiStatusMessage;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const message = body.message ?? {};
  if (message.type !== "status-update") {
    return NextResponse.json({ ok: true, ignored: message.type ?? "unknown" });
  }

  const callId = message.call?.id;
  const status = message.status;
  if (!callId || !status) {
    return NextResponse.json({ ok: true, ignored: "missing call.id or status" });
  }

  try {
    await getAdminDb()
      .doc(`subAccounts/${subAccountId}/voiceCalls/${callId}`)
      .set(
        {
          subAccountId,
          callId,
          liveStatus: status,
          liveStatusAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
  } catch (err) {
    console.warn(
      `[vapi/status] write failed sa=${subAccountId} call=${callId}`,
      err,
    );
  }

  return NextResponse.json({ ok: true });
}
