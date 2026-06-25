import "server-only";

import type { AiAgentProfile, VoiceChannelConfig } from "@/types/ai";
import type { TwilioConfig } from "@/types";

/**
 * Thin Vapi REST wrapper. We use Vapi as a "front-end" — it owns the
 * STT/TTS/turn-taking/barge-in pipeline for inbound calls. Per-turn LLM
 * decisions stream back to our `/api/webhooks/vapi/llm/[saId]` endpoint
 * (custom-LLM mode), which means every voice reply runs through the
 * SAME `resolveAgent()` + `buildSystemPrompt()` + OpenRouter path that
 * powers SMS and Web Chat. Zero persona drift across channels.
 *
 * Phone numbers are BYOC (bring-your-own-carrier) — we register the
 * sub-account's existing dedicated Twilio number with Vapi rather than
 * renting a new number. One number → SMS + Voice, single bill.
 */

const VAPI_BASE_URL = "https://api.vapi.ai";

export class VapiError extends Error {
  status: number;
  body: string;
  constructor(message: string, status: number, body: string) {
    super(message);
    this.name = "VapiError";
    this.status = status;
    this.body = body;
  }
}

export function vapiIsConfigured(): boolean {
  return Boolean(
    process.env.VAPI_API_KEY?.trim() && process.env.VAPI_WEBHOOK_SECRET?.trim(),
  );
}

function getApiKey(): string {
  const key = process.env.VAPI_API_KEY?.trim();
  if (!key) {
    throw new VapiError("VAPI_API_KEY is not set", 500, "");
  }
  return key;
}

function getWebhookSecret(): string {
  const s = process.env.VAPI_WEBHOOK_SECRET?.trim();
  if (!s) {
    throw new VapiError("VAPI_WEBHOOK_SECRET is not set", 500, "");
  }
  return s;
}

function getAppUrl(): string {
  const url = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!url) {
    throw new VapiError(
      "NEXT_PUBLIC_APP_URL is not set — Vapi must reach our LLM endpoint",
      500,
      "",
    );
  }
  return url.replace(/\/$/, "");
}

async function vapiFetch<T>(
  path: string,
  init: RequestInit,
): Promise<T> {
  const res = await fetch(`${VAPI_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getApiKey()}`,
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new VapiError(
      `Vapi ${init.method ?? "GET"} ${path} -> ${res.status}`,
      res.status,
      text.slice(0, 2000),
    );
  }
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new VapiError(
      `Vapi returned non-JSON for ${path}`,
      res.status,
      text.slice(0, 2000),
    );
  }
}

/**
 * The assistant config Vapi expects. We use the "custom-llm" model
 * provider so Vapi posts chat completions to our endpoint per turn.
 * Vapi handles STT (Deepgram default), TTS (configured voice), VAD,
 * barge-in, end-pointing. Our endpoint owns persona/KB/escalation
 * logic via the existing AI pipeline.
 */
interface VapiAssistantBody {
  name: string;
  firstMessage: string;
  endCallMessage: string;
  maxDurationSeconds: number;
  silenceTimeoutSeconds: number;
  model: {
    provider: "custom-llm";
    model: string;
    url: string;
  };
  voice: {
    provider: string;
    voiceId: string;
  };
  server: {
    url: string;
    timeoutSeconds: number;
  };
  /** Explicit subscription list of server-side webhook events. Without
   *  this Vapi falls back to provider defaults — which on web calls
   *  has been observed to NOT include end-of-call-report, leaving us
   *  with no post-call extraction. Always include the events we
   *  actually act on. */
  serverMessages: Array<
    "end-of-call-report" | "status-update" | "hang" | "transcript"
  >;
  /** Vapi runs a post-call extraction pass over the transcript and
   *  sends the structured payload to the server URL above. Schema +
   *  messages are declared here so Vapi doesn't overwrite our PATCHes
   *  with its dashboard defaults (which would force a manual Publish
   *  every time the operator edits voice settings). */
  analysisPlan: {
    structuredDataPlan: {
      enabled: boolean;
      schema: {
        type: "object";
        properties: Record<
          string,
          { type: string; description: string }
        >;
      };
      messages: Array<{ role: "system" | "user"; content: string }>;
    };
    summaryPlan: {
      enabled: boolean;
    };
  };
  metadata: Record<string, string>;
}

interface VapiAssistantResponse {
  id: string;
}

interface VapiPhoneNumberResponse {
  id: string;
}

function buildAssistantBody(input: {
  subAccountId: string;
  profile: AiAgentProfile;
  voice: VoiceChannelConfig;
  modelOverride: string | null;
}): VapiAssistantBody {
  const appUrl = getAppUrl();
  // Bake the webhook secret into the URL as a `?s=` query param. Why:
  //   - Vapi's `server.secret` field sends `X-Vapi-Secret` (not the
  //     `Authorization: Bearer` our routes expected) — so a header
  //     check would always 401.
  //   - Custom-LLM `model.url` has no native auth mechanism at all;
  //     Vapi just POSTs the URL plain. A query-param secret is the
  //     simplest auth that works for ALL three endpoints uniformly.
  //
  // Vapi quirk: for custom-llm it dumb-string-appends "/chat/completions"
  // to the WHOLE registered URL including the query string. We add a
  // trailing throwaway `&_=` param so the append lands inside that
  // sink (`_=/chat/completions`) instead of corrupting `s=secret`. The
  // server URL doesn't have this concat issue but harmless to mirror.
  // The secret travels over TLS and never appears in client-side
  // logs since Vapi originates the requests server-to-server.
  const secret = getWebhookSecret();
  const q = `?s=${encodeURIComponent(secret)}&_=`;
  const llmUrl = `${appUrl}/api/webhooks/vapi/llm/${input.subAccountId}${q}`;
  const serverUrl = `${appUrl}/api/webhooks/vapi/end-of-call/${input.subAccountId}${q}`;
  const defaultModel =
    input.modelOverride?.trim() ||
    process.env.AI_REPLIES_DEFAULT_MODEL?.trim() ||
    "anthropic/claude-haiku-4-5";

  return {
    // Vapi caps name at 40 chars; sub-account ids are ~20 chars so a
    // long prefix overflows. Truncate defensively.
    name: `LeadStack sa:${input.subAccountId}`.slice(0, 40),
    firstMessage: input.voice.greeting,
    endCallMessage: "Talk soon. Bye.",
    maxDurationSeconds: input.voice.maxCallSeconds,
    silenceTimeoutSeconds: 20,
    model: {
      provider: "custom-llm",
      // Echoed back to our LLM endpoint as `body.model`. We override
      // there from the live channel config — this is a hint only.
      model: defaultModel,
      url: llmUrl,
    },
    voice: {
      provider: input.voice.voiceProvider,
      voiceId: input.voice.voiceId,
    },
    server: {
      url: serverUrl,
      // Bound our webhook's response time. Custom-LLM turns should
      // complete in well under 5s; 20s is Vapi's UI default and gives
      // headroom for cold starts. Auth lives in the URL's `?s=` query
      // param (see comment on llmUrl construction above) — we don't
      // use Vapi's `server.secret` because that sends X-Vapi-Secret
      // (mismatched with header-based auth checks) and the same query
      // param mechanism works uniformly for the custom-LLM URL too.
      timeoutSeconds: 20,
    },
    // Without this, Vapi's default serverMessages omits
    // `end-of-call-report` for some call types (notably web calls),
    // so our post-call Contact/Task/email pipeline never fires.
    // Explicit list = no surprises.
    serverMessages: ["end-of-call-report", "status-update", "hang"],
    analysisPlan: {
      structuredDataPlan: {
        enabled: true,
        // Standard extraction template Vapi defaults to in the UI —
        // pinned here so PATCHes don't drift into "Unsaved changes"
        // state and force a manual Publish every time.
        messages: [
          {
            role: "system",
            content:
              "You are an expert data extractor. You will be given a transcript of a call. Extract structured data per the JSON Schema. DO NOT return anything except the structured data.\n\nJson Schema:\n{{schema}}\n\nOnly respond with the JSON.",
          },
          {
            role: "user",
            content:
              "Here is the transcript:\n\n{{transcript}}\n\n. Here is the ended reason of the call:\n\n{{endedReason}}\n\n",
          },
        ],
        schema: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description:
                "Caller's name if shared during the call. Empty string if not given.",
            },
            email: {
              type: "string",
              description:
                "Caller's email if shared. Must be a valid email address. Empty string if not given.",
            },
            phone: {
              type: "string",
              description:
                "Callback phone number if the caller explicitly asked us to call back on a DIFFERENT number than the one they called from. Empty string otherwise.",
            },
            callbackRequested: {
              type: "boolean",
              description:
                "True if the caller asked for someone to call them back, false if they just had a question that was answered on the call.",
            },
            interested: {
              type: "boolean",
              description:
                "For an OUTBOUND call about an offer or program: true if the person expressed interest in signing up / learning more / being followed up about it. False if they declined, weren't interested, or it was an inbound enquiry. Default false when unsure.",
            },
            interestReason: {
              type: "string",
              description:
                "One short sentence on what they were interested in or why, e.g. 'Wants to join the 30-Day Challenge', 'Asked to be called back after payday'. Empty string if not interested.",
            },
            reason: {
              type: "string",
              description:
                "One sentence describing what the caller wanted. E.g. 'Quote for a kitchen renovation', 'Asked about Saturday opening hours'.",
            },
          },
        },
      },
      summaryPlan: {
        enabled: true,
      },
    },
    metadata: {
      subAccountId: input.subAccountId,
      source: "leadstack",
    },
  };
}

/**
 * Idempotent create-or-update of the Vapi assistant for this
 * sub-account. Pass `existingAssistantId` from the stored
 * VoiceChannelConfig.vapiAssistantId to update in place; pass null to
 * create fresh. Returns the assistant id either way.
 */
export async function ensureVapiAssistant(input: {
  subAccountId: string;
  profile: AiAgentProfile;
  voice: VoiceChannelConfig;
  modelOverride: string | null;
  existingAssistantId: string | null;
}): Promise<{ assistantId: string }> {
  const body = buildAssistantBody({
    subAccountId: input.subAccountId,
    profile: input.profile,
    voice: input.voice,
    modelOverride: input.modelOverride,
  });

  if (input.existingAssistantId) {
    try {
      await vapiFetch<VapiAssistantResponse>(
        `/assistant/${input.existingAssistantId}`,
        {
          method: "PATCH",
          body: JSON.stringify(body),
        },
      );
      return { assistantId: input.existingAssistantId };
    } catch (err) {
      // If the stored assistant id no longer exists (operator deleted
      // it in Vapi dashboard, or we've changed regions), fall through
      // to create a fresh one.
      if (err instanceof VapiError && err.status === 404) {
        console.warn(
          `[vapi] stored assistantId ${input.existingAssistantId} not found, re-creating`,
        );
      } else {
        throw err;
      }
    }
  }

  const created = await vapiFetch<VapiAssistantResponse>("/assistant", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return { assistantId: created.id };
}

/**
 * Idempotent BYOC phone-number registration. Vapi stores the Twilio
 * credentials and routes inbound calls to that number through their
 * pipeline, attaching the named assistant. Patching the Twilio creds
 * (e.g. operator rotated the auth token) requires creating a new
 * phone-number resource — Vapi treats creds as immutable on the
 * resource. So if existingPhoneNumberId is present we update the
 * assistant binding only; cred rotation requires explicit deletion +
 * re-create which the channel save route handles.
 */
export async function ensureVapiPhoneNumber(input: {
  subAccountId: string;
  twilioConfig: TwilioConfig;
  assistantId: string;
  existingPhoneNumberId: string | null;
}): Promise<{ phoneNumberId: string }> {
  if (input.existingPhoneNumberId) {
    try {
      await vapiFetch(`/phone-number/${input.existingPhoneNumberId}`, {
        method: "PATCH",
        body: JSON.stringify({ assistantId: input.assistantId }),
      });
      return { phoneNumberId: input.existingPhoneNumberId };
    } catch (err) {
      if (err instanceof VapiError && err.status === 404) {
        console.warn(
          `[vapi] stored phoneNumberId ${input.existingPhoneNumberId} not found, re-registering`,
        );
      } else {
        throw err;
      }
    }
  }

  const created = await vapiFetch<VapiPhoneNumberResponse>("/phone-number", {
    method: "POST",
    body: JSON.stringify({
      provider: "twilio",
      number: input.twilioConfig.fromNumber,
      twilioAccountSid: input.twilioConfig.accountSid,
      twilioAuthToken: input.twilioConfig.authToken,
      assistantId: input.assistantId,
      // Same 40-char clamp as the assistant for symmetry.
      name: `LeadStack sa:${input.subAccountId}`.slice(0, 40),
    }),
  });
  return { phoneNumberId: created.id };
}

/**
 * Place an OUTBOUND call. Reuses the already-provisioned inbound
 * assistant + phone-number — no second assistant. Vapi dials the
 * customer number from our registered number and runs the exact same
 * custom-LLM + end-of-call pipeline inbound uses. `assistantOverrides`
 * swaps in the outbound opener and stamps direction + contactId into
 * call metadata so the end-of-call handler can link the call to the
 * contact and mark it outbound.
 *
 * Returns Vapi's call id (used as the voiceCalls doc id, same as inbound).
 */
export async function createOutboundCall(input: {
  assistantId: string;
  phoneNumberId: string;
  customerNumber: string;
  /** Null for a test call (no contact to link). */
  contactId: string | null;
  /** Campaign id when this call is part of a bulk campaign — stamped into
   *  call metadata so the end-of-call handler can write the outcome back
   *  to the campaign recipient row. */
  campaignId?: string | null;
  firstMessage: string;
  /** Test call — the end-of-call pipeline short-circuits on this flag so
   *  a test leaves no Contact / Task / summary doc behind. */
  test?: boolean;
  /** Optional hard cap on call length (seconds). Vapi ends the call when
   *  reached. Used to keep test calls short. */
  maxDurationSeconds?: number;
}): Promise<{ callId: string; controlUrl: string | null }> {
  // Call-LEVEL metadata — Vapi echoes this back as `call.metadata` on
  // every custom-LLM + end-of-call webhook, which is how the LLM webhook
  // knows to use the outbound persona. (assistantOverrides.metadata is
  // NOT surfaced on the webhook call object, so it must live here.)
  const metadata: Record<string, string> = { direction: "outbound" };
  if (input.contactId) metadata.contactId = input.contactId;
  if (input.campaignId) metadata.campaignId = input.campaignId;
  if (input.test) metadata.test = "1";

  const assistantOverrides: Record<string, unknown> = {
    firstMessage: input.firstMessage,
  };
  if (
    typeof input.maxDurationSeconds === "number" &&
    input.maxDurationSeconds > 0
  ) {
    assistantOverrides.maxDurationSeconds = Math.floor(
      input.maxDurationSeconds,
    );
  }

  const created = await vapiFetch<{
    id: string;
    monitor?: { controlUrl?: string };
  }>("/call", {
    method: "POST",
    body: JSON.stringify({
      assistantId: input.assistantId,
      phoneNumberId: input.phoneNumberId,
      customer: { number: input.customerNumber },
      metadata,
      assistantOverrides,
    }),
  });
  return {
    callId: created.id,
    controlUrl: created.monitor?.controlUrl ?? null,
  };
}

/**
 * End a live call via its per-call control URL (returned by Vapi on
 * call create as `monitor.controlUrl`). The URL embeds its own token, so
 * no auth header is needed — it's a plain POST of `{ type: "end-call" }`.
 * Used by the "End call" action on a test call. Best-effort: the call's
 * hard `maxDurationSeconds` cap is the backstop if this fails.
 */
export async function endCallViaControl(controlUrl: string): Promise<void> {
  const res = await fetch(controlUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "end-call" }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new VapiError(
      `Vapi control end-call -> ${res.status}`,
      res.status,
      body.slice(0, 500),
    );
  }
}

/**
 * Bind our assistant to a phone-number resource the operator already
 * owns inside Vapi (vapi-managed mode). Unlike the BYOC path, we never
 * create — the resource must exist + the operator has pasted its id.
 * Idempotent: a no-op when the binding is already correct. Returns the
 * same id back for symmetry with `ensureVapiPhoneNumber`.
 *
 * 404 here is a user error (bad id pasted), not something we silently
 * recover from — the BYOC fallback wouldn't make sense in vapi-managed
 * mode where the operator-pasted id is the contract.
 */
export async function bindVapiAssistantToPhoneNumber(input: {
  phoneNumberId: string;
  assistantId: string;
}): Promise<{ phoneNumberId: string }> {
  await vapiFetch(`/phone-number/${input.phoneNumberId}`, {
    method: "PATCH",
    body: JSON.stringify({ assistantId: input.assistantId }),
  });
  return { phoneNumberId: input.phoneNumberId };
}

/**
 * Unbind whatever assistant is currently attached to a phone-number
 * (sets assistantId: null). Used on disable for vapi-managed mode:
 * the operator owns the number so we can't delete it, but we don't
 * want calls continuing to hit our LLM endpoint after the channel is
 * turned off. Best-effort — operator may have already cleared this in
 * the Vapi dashboard, or rotated the resource.
 */
export async function unbindVapiPhoneNumber(
  phoneNumberId: string | null,
): Promise<void> {
  if (!phoneNumberId) return;
  try {
    await vapiFetch(`/phone-number/${phoneNumberId}`, {
      method: "PATCH",
      body: JSON.stringify({ assistantId: null }),
    });
  } catch (err) {
    console.warn(`[vapi] unbind phone-number ${phoneNumberId} failed`, err);
  }
}

/** Best-effort teardown. Errors are swallowed — operator may have
 *  already deleted the resource manually, and a failed delete here
 *  doesn't justify blocking the channel disable. */
export async function deleteVapiAssistant(
  assistantId: string | null,
): Promise<void> {
  if (!assistantId) return;
  try {
    await vapiFetch(`/assistant/${assistantId}`, { method: "DELETE" });
  } catch (err) {
    console.warn(`[vapi] delete assistant ${assistantId} failed`, err);
  }
}

export async function deleteVapiPhoneNumber(
  phoneNumberId: string | null,
): Promise<void> {
  if (!phoneNumberId) return;
  try {
    await vapiFetch(`/phone-number/${phoneNumberId}`, { method: "DELETE" });
  } catch (err) {
    console.warn(`[vapi] delete phone-number ${phoneNumberId} failed`, err);
  }
}
