import "server-only";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { callAi, type AiChatMessage } from "@/lib/comms/ai/openrouter";
import { incrementChannelTokens, resolveAgent } from "@/lib/comms/ai/agent";
import { buildContactContextBlock } from "@/lib/comms/ai/context";
import { buildSystemPrompt } from "@/lib/comms/ai/prompt";
import type { SubAccountDoc } from "@/types";
import type { Contact } from "@/types/contacts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Vapi custom-LLM webhook. Vapi POSTs this endpoint on every voice
 * turn with an OpenAI-compatible chat-completion request body — we
 * respond with an OpenAI-shaped completion that Vapi reads aloud.
 *
 * Vapi quirk: it dumb-string-concatenates `/chat/completions` to the
 * registered model.url. The resulting HTTP request *path* stays at
 * `/api/webhooks/vapi/llm/[subAccountId]` (this file's location);
 * the `/chat/completions` ends up tacked onto the query string. To
 * keep our `?s=` secret param clean, we register the URL with a
 * trailing `&_=` so Vapi appends `/chat/completions` to the `_=`
 * sink instead of corrupting `s=`. See vapi.ts buildAssistantBody().
 *
 * This route is the one and only choke-point where voice replies are
 * generated, so it MUST go through the same `resolveAgent()` +
 * `buildSystemPrompt()` + `callAi()` pipeline SMS and Web Chat use.
 * That's how the persona / KB / business hours / escalation rules
 * stay consistent across channels. We deliberately IGNORE the system
 * prompt Vapi composes — its contents are not what the operator
 * configured.
 *
 * Security: the webhook secret travels as a `?s=…` query param baked
 * into the URL we registered with Vapi at provisioning time. Custom-
 * LLM has no native auth mechanism so a URL secret is the simplest
 * shape that survives Vapi's path-append behavior.
 *
 * Response shape: non-streaming OpenAI completion in v1. Haiku 4.5
 * latency is sub-1s which keeps the perceived turn-around tight.
 * Streaming SSE can be added later if latency becomes the bottleneck.
 */

interface VapiLlmBody {
  model?: string;
  messages?: Array<{ role: string; content: string }>;
  /** Vapi defaults to true for voice (low-latency streaming). When
   *  true we return SSE; when explicitly false we return single JSON. */
  stream?: boolean;
  /** Vapi's per-call context. The customer phone is what we use to
   *  look up an existing Contact for context injection. */
  call?: {
    id?: string;
    customer?: { number?: string };
    phoneNumber?: { number?: string };
    /** Metadata we stamp via assistantOverrides on outbound calls (see
     *  createOutboundCall). Vapi echoes it back on every turn so we can
     *  pick the outbound persona. */
    metadata?: { direction?: string; contactId?: string };
  };
}

function badRequest(message: string, status: number): NextResponse {
  return NextResponse.json({ error: { message } }, { status });
}

function authorize(request: Request): boolean {
  const expected = process.env.VAPI_WEBHOOK_SECRET?.trim();
  if (!expected) return false;
  // Secret travels as a `?s=` query param. URL params are auto-decoded
  // by URLSearchParams so we compare against the raw secret value.
  const provided = new URL(request.url).searchParams.get("s")?.trim() ?? "";
  return provided.length > 0 && provided === expected;
}

async function findContactByPhone(
  subAccountId: string,
  phone: string,
): Promise<Contact | null> {
  const snap = await getAdminDb()
    .collection("contacts")
    .where("subAccountId", "==", subAccountId)
    .where("phone", "==", phone)
    .limit(1)
    .get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  return { id: doc.id, ...(doc.data() as Omit<Contact, "id">) };
}

function openAiCompletion(text: string, model: string): unknown {
  return {
    id: `chatcmpl-${Date.now()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: text },
        finish_reason: "stop",
      },
    ],
    usage: {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
    },
  };
}

/**
 * Strip anything the model might emit that would be embarrassing read
 * aloud: leftover [[capture …]] / [[form …]] markers, stray markdown
 * asterisks, bracket fragments. The voice safety rails forbid these
 * but prompt drift happens; this is the last line of defense before
 * the TTS engine pronounces "bracket bracket capture name equals"
 * verbatim on a real call.
 */
function stripVoiceUnspeakables(text: string): string {
  return (
    text
      // Whole [[anything]] blocks — capture markers, form markers, etc.
      .replace(/\[\[[^\]]*\]\]/g, "")
      // Stray opening/closing brackets the regex above might miss
      // if the model emitted an unclosed marker.
      .replace(/\[\[/g, "")
      .replace(/\]\]/g, "")
      // Markdown asterisks (TTS would say "asterisk asterisk").
      .replace(/\*\*/g, "")
      .replace(/(?<!\w)\*(?!\w)/g, "")
      // Collapse runs of whitespace the strips may have created.
      .replace(/[ \t]{2,}/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}

/**
 * Stream the reply as OpenAI-format SSE chunks. Vapi expects this
 * shape for custom-LLM (it's the OpenAI streaming chat-completion
 * format). We don't have a token-level stream from OpenRouter here,
 * so we emit the full text as a single content chunk followed by a
 * stop chunk and the [DONE] sentinel. Voice latency is dominated by
 * the upstream LLM call anyway, so single-chunk streaming has the
 * same perceived latency as token streaming would for these short
 * voice replies.
 */
function openAiSseStream(text: string, model: string): Response {
  const id = `chatcmpl-${Date.now()}`;
  const created = Math.floor(Date.now() / 1000);
  const chunk = (delta: Record<string, unknown>, finish: string | null) =>
    `data: ${JSON.stringify({
      id,
      object: "chat.completion.chunk",
      created,
      model,
      choices: [{ index: 0, delta, finish_reason: finish }],
    })}\n\n`;

  const body =
    chunk({ role: "assistant", content: text }, null) +
    chunk({}, "stop") +
    "data: [DONE]\n\n";

  return new Response(body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ subAccountId: string }> },
) {
  if (!authorize(request)) {
    // Make the #1 cause of "custom-llm 500" visible: the ?s= secret on the
    // assistant URL doesn't match this server's VAPI_WEBHOOK_SECRET (stale
    // secret baked in at provision time, or the assistant points at a
    // different deployment). Fix: re-save Voice settings to re-PATCH the
    // assistant with the current URL + secret.
    const provided = new URL(request.url).searchParams.get("s");
    const expected = process.env.VAPI_WEBHOOK_SECRET?.trim();
    console.warn(
      `[vapi/llm] 401 — webhook secret mismatch. providedSecret=${
        provided ? "present" : "MISSING"
      } serverSecretConfigured=${expected ? "yes" : "NO"} ` +
        `match=${provided?.trim() === expected}. ` +
        `Re-save Voice settings to re-point the assistant.`,
    );
    return badRequest("Unauthorized", 401);
  }

  const { subAccountId } = await ctx.params;

  let body: VapiLlmBody;
  try {
    body = (await request.json()) as VapiLlmBody;
  } catch {
    return badRequest("Invalid JSON body", 400);
  }

  // Everything below is wrapped so ANY unexpected throw degrades to a
  // graceful spoken fallback (HTTP 200) instead of a hard 500 that drops
  // the live call. The real error is logged for debugging. Legit auth /
  // config short-circuits below still `return` their own status codes.
  const wantsStream = body.stream !== false;
  try {
  const agent = await resolveAgent(subAccountId, "voice");
  if (!agent) {
    return badRequest("Voice channel not configured for this sub-account", 404);
  }
  if (!agent.effective.enabled) {
    return badRequest("Voice channel is disabled for this sub-account", 403);
  }
  if (!agent.effective.systemPrompt.trim()) {
    return badRequest("Voice channel has no persona configured", 503);
  }

  const saSnap = await getAdminDb().doc(`subAccounts/${subAccountId}`).get();
  if (!saSnap.exists) return badRequest("Sub-account not found", 404);
  const subAccount = saSnap.data() as SubAccountDoc;

  const callerPhone = body.call?.customer?.number?.trim() ?? "";
  const contact = callerPhone
    ? await findContactByPhone(subAccountId, callerPhone).catch(() => null)
    : null;

  const contextBlock = contact
    ? await buildContactContextBlock(contact).catch(() => null)
    : null;

  // Outbound calls run a different persona than inbound (the AI is calling
  // the contact about an offer, not answering a query). We stamp
  // direction:"outbound" into the call metadata at createOutboundCall; when
  // present AND an outbound persona is configured, swap it in. Falls back to
  // the shared persona when blank or for inbound calls.
  const isOutbound = body.call?.metadata?.direction === "outbound";
  const outboundPersona = agent.channel.voice?.outboundSystemPrompt?.trim();
  const personaOverride =
    isOutbound && outboundPersona ? outboundPersona : null;

  const systemPrompt = buildSystemPrompt({
    agent,
    channelId: "voice",
    fallbackBusinessName: subAccount.name ?? "the business",
    contactContextBlock: contextBlock,
    personaOverride,
  });

  // Strip Vapi's own system message — the persona we want is the one
  // we just composed. Keep the user / assistant turn history as-is.
  const turns: AiChatMessage[] = (body.messages ?? [])
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: typeof m.content === "string" ? m.content : "",
    }))
    .filter((m) => m.content.length > 0);

  const messages: AiChatMessage[] = [
    { role: "system", content: systemPrompt },
    ...turns,
  ];

  // Vapi defaults to stream:true for custom-LLM (low-latency voice).
  // (wantsStream is computed above so the outer catch can reuse it.)

  try {
    const completion = await callAi({
      model: agent.effective.modelOverride ?? body.model ?? undefined,
      messages,
      // Voice replies should be short — cap aggressively to avoid the
      // bot launching into a paragraph that the caller will interrupt.
      maxTokens: 220,
      temperature: 0.5,
    });

    void incrementChannelTokens(subAccountId, "voice", completion.totalTokens);

    // Defensive: strip any [[...]] markers, leftover JSON-ish brackets,
    // or asterisks from the reply before TTS speaks it. Voice safety
    // rails forbid these but model output drifts; on voice the TTS
    // engine reads symbols out loud character-by-character which sounds
    // terrible. Web Chat / SMS keep their marker parsing untouched —
    // this is voice-only sanitisation.
    const speakable = stripVoiceUnspeakables(completion.text);

    return wantsStream
      ? openAiSseStream(speakable, completion.model)
      : NextResponse.json(openAiCompletion(speakable, completion.model));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error(
      `[vapi/llm] LLM call failed sa=${subAccountId}: ${msg}`,
    );
    // Return a graceful spoken fallback. Status 200 so Vapi doesn't
    // play its own error message (which sounds worse than our text).
    const fallbackText =
      "Sorry, I'm having trouble hearing you. Could you say that again?";
    const fallbackModel = agent.effective.modelOverride ?? "fallback";
    return wantsStream
      ? openAiSseStream(fallbackText, fallbackModel)
      : NextResponse.json(openAiCompletion(fallbackText, fallbackModel));
  }
  } catch (outerErr) {
    // Unexpected throw OUTSIDE the LLM call (resolveAgent, Firestore read,
    // prompt build, etc.). Log the full error + stack so the root cause is
    // visible in the server logs, and degrade gracefully so the live call
    // doesn't drop with a provider-fault 500.
    console.error(
      `[vapi/llm] UNHANDLED error sa=${subAccountId} —`,
      outerErr,
    );
    const fallbackText =
      "Sorry, I'm having a bit of trouble right now. Could you say that again?";
    return wantsStream
      ? openAiSseStream(fallbackText, "fallback")
      : NextResponse.json(openAiCompletion(fallbackText, "fallback"));
  }
}
