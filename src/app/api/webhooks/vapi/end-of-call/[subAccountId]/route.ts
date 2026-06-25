import "server-only";

import { NextResponse } from "next/server";
import { handleVapiEndOfCall } from "@/lib/comms/voice/end-of-call";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Vapi end-of-call webhook. Fired once per call after Vapi finishes
 * its post-call analysis pass (transcript summary + structured-data
 * extraction). We use it to create the Contact + Task + escalation
 * email + voiceCalls summary doc.
 *
 * Vapi sends a single payload event of type "end-of-call-report". The
 * shape is wrapped in `{ message: { ... } }` per Vapi's server-message
 * convention. Status events (call.started, call.ended, etc.) go to a
 * different endpoint so this route doesn't have to multiplex.
 *
 * Always returns 200 — Vapi treats 5xx as retryable and we don't want
 * duplicate Tasks / emails on a retry. Failures are logged + included
 * in the JSON response for offline inspection.
 */

interface VapiTurnRecord {
  role?: string;
  /** Newer Vapi shape uses `message`; older / artifact shape uses
   *  `content`. We try both. */
  message?: string;
  content?: string;
  time?: number;
  secondsFromStart?: number;
  endTime?: number;
}

interface VapiServerMessage {
  message?: {
    type?: string;
    call?: {
      id?: string;
      customer?: { number?: string };
      phoneNumber?: { number?: string };
      /** Metadata we stamped via assistantOverrides on outbound calls
       *  (see createOutboundCall). Vapi echoes it back on the call. */
      metadata?: {
        direction?: string;
        contactId?: string;
        campaignId?: string;
        test?: string;
      };
    };
    durationSeconds?: number;
    summary?: string;
    endedReason?: string;
    /** Vapi places structured extraction here when the assistant has
     *  `analysisPlan.structuredDataPlan.enabled === true`. */
    analysis?: {
      summary?: string;
      structuredData?: Record<string, unknown>;
    };
    /** Full turn-by-turn transcript. Vapi has shipped a few different
     *  shapes for this over time — check the modern `artifact.messages`
     *  first, fall back to the top-level `messages` array. */
    messages?: VapiTurnRecord[];
    artifact?: {
      messages?: VapiTurnRecord[];
      transcript?: string;
    };
  };
}

function authorize(request: Request): boolean {
  const expected = process.env.VAPI_WEBHOOK_SECRET?.trim();
  if (!expected) return false;
  // See LLM route's authorize() for why the secret is in the URL.
  const provided = new URL(request.url).searchParams.get("s")?.trim() ?? "";
  return provided.length > 0 && provided === expected;
}

function asString(v: unknown): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}

function asBool(v: unknown): boolean | null {
  return typeof v === "boolean" ? v : null;
}

/**
 * Normalise Vapi's transcript turns into our canonical shape. Handles
 * both the `artifact.messages` (modern) and `message.messages` (older)
 * locations + variant field names (`message` vs `content`). System /
 * tool / function turns are dropped — the operator console only cares
 * about the conversational user/assistant exchange.
 */
function extractTranscript(
  message: NonNullable<VapiServerMessage["message"]>,
): Array<{
  role: "assistant" | "user" | "system";
  content: string;
  secondsFromStart: number | null;
}> {
  const raw = message.artifact?.messages ?? message.messages ?? [];
  const out: Array<{
    role: "assistant" | "user" | "system";
    content: string;
    secondsFromStart: number | null;
  }> = [];
  for (const r of raw) {
    const role = (r.role ?? "").toLowerCase();
    if (role !== "user" && role !== "assistant" && role !== "bot" && role !== "system") {
      continue;
    }
    const normRole = role === "bot" ? "assistant" : (role as "user" | "assistant" | "system");
    const content =
      typeof r.message === "string"
        ? r.message
        : typeof r.content === "string"
          ? r.content
          : "";
    if (!content.trim()) continue;
    const secondsFromStart =
      typeof r.secondsFromStart === "number"
        ? r.secondsFromStart
        : typeof r.time === "number" && message.durationSeconds
          ? null
          : null;
    out.push({ role: normRole, content: content.trim(), secondsFromStart });
  }
  return out;
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ subAccountId: string }> },
) {
  if (!authorize(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { subAccountId } = await ctx.params;

  let body: VapiServerMessage;
  try {
    body = (await request.json()) as VapiServerMessage;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const message = body.message ?? {};
  if (message.type !== "end-of-call-report") {
    // Quietly accept other event types — Vapi's webhook may multiplex.
    // The dedicated /status endpoint is the home for non-EOC events.
    return NextResponse.json({ ok: true, ignored: message.type ?? "unknown" });
  }

  const callId = asString(message.call?.id);
  if (!callId) {
    return NextResponse.json({ error: "Missing call.id" }, { status: 400 });
  }

  // Test calls (placed from the Outbound settings page) leave no trace —
  // skip contact reconciliation, task, escalation email, and the summary
  // doc entirely.
  if (message.call?.metadata?.test === "1") {
    return NextResponse.json({ ok: true, ignored: "test_call" });
  }

  const structured = message.analysis?.structuredData ?? {};
  const transcript = extractTranscript(message);

  try {
    const result = await handleVapiEndOfCall({
      subAccountId,
      payload: {
        callId,
        callerPhone: asString(message.call?.customer?.number),
        toPhone: asString(message.call?.phoneNumber?.number),
        durationSec:
          typeof message.durationSeconds === "number"
            ? Math.max(0, Math.floor(message.durationSeconds))
            : 0,
        summary:
          asString(message.analysis?.summary) ?? asString(message.summary),
        endedReason: asString(message.endedReason),
        extracted: {
          name: asString(structured.name),
          email: asString(structured.email),
          phone: asString(structured.phone),
          callbackRequested: asBool(structured.callbackRequested),
          interested: asBool(structured.interested),
          interestReason: asString(structured.interestReason),
          reason: asString(structured.reason),
        },
        transcript,
        direction:
          message.call?.metadata?.direction === "outbound"
            ? "outbound"
            : undefined,
        metaContactId: asString(message.call?.metadata?.contactId),
        metaCampaignId: asString(message.call?.metadata?.campaignId),
      },
    });
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error(
      `[vapi/end-of-call] handler failed sa=${subAccountId}: ${msg}`,
    );
    // Still 200 — see header comment.
    return NextResponse.json({ ok: false, error: msg });
  }
}
