import { NextResponse } from "next/server";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { getAdminDb } from "@/lib/firebase/admin";
import {
  getAgentProfile,
  getChannelConfig,
  upsertChannelConfig,
  type ConfiguredChannelId,
} from "@/lib/comms/ai/agent";
import type {
  AiChannelConfig,
  VoiceChannelConfig,
  WebChatChannelConfig,
  WhatsappChannelConfig,
} from "@/types/ai";
import {
  DEFAULT_VOICE_CONFIG,
  DEFAULT_WEB_CHAT_CONFIG,
  DEFAULT_WHATSAPP_CONFIG,
} from "@/types/ai";
import { subAccountWhatsappIsConfigured } from "@/lib/comms/twilio";
import type { SubAccountDoc } from "@/types";
import {
  bindVapiAssistantToPhoneNumber,
  deleteVapiAssistant,
  deleteVapiPhoneNumber,
  ensureVapiAssistant,
  ensureVapiPhoneNumber,
  unbindVapiPhoneNumber,
  vapiIsConfigured,
  VapiError,
} from "@/lib/comms/voice/vapi";

export const dynamic = "force-dynamic";

const VALID_CHANNELS: ConfiguredChannelId[] = [
  "sms",
  "web-chat",
  "voice",
  "whatsapp",
];

function isValidChannel(v: string): v is ConfiguredChannelId {
  return (VALID_CHANNELS as string[]).includes(v);
}

/** Strip a domain string down to bare hostname. Accepts URLs with scheme
 *  or bare hostnames. Returns null for anything that doesn't look like a
 *  domain so the operator's typos don't poison the allowlist silently. */
function normaliseDomain(input: string): string | null {
  let s = input.trim().toLowerCase();
  if (!s) return null;
  if (s.includes("://")) {
    try {
      s = new URL(s).hostname;
    } catch {
      return null;
    }
  } else {
    s = s.replace(/^https?:\/\//, "").split("/")[0]!.split(":")[0]!;
  }
  // Permissive: a hostname has a dot (example.com) OR is "localhost".
  if (!s.includes(".") && s !== "localhost") return null;
  if (!/^[a-z0-9.-]+$/.test(s)) return null;
  return s;
}

function sanitiseVoiceBlock(raw: unknown): Partial<VoiceChannelConfig> {
  if (!raw || typeof raw !== "object") return {};
  const r = raw as Record<string, unknown>;
  const out: Partial<VoiceChannelConfig> = {};

  if ("greeting" in r && typeof r.greeting === "string") {
    out.greeting = r.greeting.trim().slice(0, 400);
  }
  if ("voiceProvider" in r && typeof r.voiceProvider === "string") {
    out.voiceProvider = r.voiceProvider.trim().slice(0, 40);
  }
  if ("voiceId" in r && typeof r.voiceId === "string") {
    out.voiceId = r.voiceId.trim().slice(0, 120);
  }
  if ("maxCallSeconds" in r && typeof r.maxCallSeconds === "number") {
    out.maxCallSeconds = Math.max(60, Math.min(1800, Math.floor(r.maxCallSeconds)));
  }
  if (
    "numberMode" in r &&
    (r.numberMode === "twilio-byoc" || r.numberMode === "vapi-managed")
  ) {
    out.numberMode = r.numberMode;
  }
  // vapiPhoneNumberId is server-managed in twilio-byoc mode but
  // operator-pasted in vapi-managed mode. Accept any non-empty string
  // here; the provisioning side-effect enforces the rule that we only
  // honour it when mode is vapi-managed.
  if ("vapiPhoneNumberId" in r) {
    const raw = r.vapiPhoneNumberId;
    if (raw === null || raw === "") {
      out.vapiPhoneNumberId = null;
    } else if (typeof raw === "string") {
      out.vapiPhoneNumberId = raw.trim().slice(0, 120);
    }
  }
  // vapiAssistantId stays server-managed in both modes — never accepted
  // from the inbound body. Populated by the provisioning side-effect.

  // ── Outbound calling fields ──────────────────────────────────────────
  if ("outboundEnabled" in r && typeof r.outboundEnabled === "boolean") {
    out.outboundEnabled = r.outboundEnabled;
  }
  if ("outboundFirstMessage" in r && typeof r.outboundFirstMessage === "string") {
    out.outboundFirstMessage = r.outboundFirstMessage.trim().slice(0, 400);
  }
  if (
    "outboundSystemPrompt" in r &&
    typeof r.outboundSystemPrompt === "string"
  ) {
    out.outboundSystemPrompt = r.outboundSystemPrompt.slice(0, 6000);
  }
  if ("outboundWindow" in r) {
    const w = r.outboundWindow as Record<string, unknown> | null;
    if (w === null) {
      out.outboundWindow = null;
    } else if (w && typeof w === "object") {
      const startHour = Number(w.startHour);
      const endHour = Number(w.endHour);
      const timezone =
        typeof w.timezone === "string" ? w.timezone.trim().slice(0, 64) : "";
      if (
        Number.isFinite(startHour) &&
        Number.isFinite(endHour) &&
        startHour >= 0 &&
        endHour <= 24 &&
        startHour < endHour &&
        timezone
      ) {
        out.outboundWindow = {
          startHour: Math.floor(startHour),
          endHour: Math.floor(endHour),
          timezone,
        };
      }
    }
  }
  if ("outboundPerMinuteCap" in r && typeof r.outboundPerMinuteCap === "number") {
    out.outboundPerMinuteCap = Math.max(
      1,
      Math.min(60, Math.floor(r.outboundPerMinuteCap)),
    );
  }
  if ("outboundDailyCap" in r && typeof r.outboundDailyCap === "number") {
    out.outboundDailyCap = Math.max(
      1,
      Math.min(5000, Math.floor(r.outboundDailyCap)),
    );
  }
  if (
    "outboundPerNumberPerDay" in r &&
    typeof r.outboundPerNumberPerDay === "number"
  ) {
    out.outboundPerNumberPerDay = Math.max(
      1,
      Math.min(20, Math.floor(r.outboundPerNumberPerDay)),
    );
  }
  if ("allowedCountries" in r) {
    const ac = r.allowedCountries;
    if (ac === null) {
      out.allowedCountries = null;
    } else if (Array.isArray(ac)) {
      const codes = ac
        .filter((v): v is string => typeof v === "string")
        .map((v) => v.trim().toUpperCase())
        .filter((v) => /^[A-Z]{2}$/.test(v))
        .slice(0, 50);
      out.allowedCountries = codes.length > 0 ? codes : null;
    }
  }

  return out;
}

function sanitiseWebChatBlock(raw: unknown): Partial<WebChatChannelConfig> {
  if (!raw || typeof raw !== "object") return {};
  const r = raw as Record<string, unknown>;
  const out: Partial<WebChatChannelConfig> = {};

  if ("allowedDomains" in r && Array.isArray(r.allowedDomains)) {
    out.allowedDomains = (r.allowedDomains as unknown[])
      .filter((v): v is string => typeof v === "string")
      .map(normaliseDomain)
      .filter((s): s is string => !!s)
      .slice(0, 25);
  }
  if ("welcomeMessage" in r && typeof r.welcomeMessage === "string") {
    out.welcomeMessage = r.welcomeMessage.slice(0, 400);
  }
  if ("accentColor" in r && typeof r.accentColor === "string") {
    const v = r.accentColor.trim();
    if (/^#[0-9a-fA-F]{6}$/.test(v)) out.accentColor = v.toLowerCase();
  }
  if (
    "position" in r &&
    (r.position === "right" || r.position === "left")
  ) {
    out.position = r.position;
  }

  return out;
}

function sanitiseWhatsappBlock(raw: unknown): Partial<WhatsappChannelConfig> {
  if (!raw || typeof raw !== "object") return {};
  const r = raw as Record<string, unknown>;
  const out: Partial<WhatsappChannelConfig> = {};
  if ("sessionWindowHours" in r && typeof r.sessionWindowHours === "number") {
    // Clamp to a sane range. Meta's standard window is 24h; never let an
    // operator push it past that (it wouldn't change Meta's enforcement,
    // only our own pre-send guard — and a too-large value would let the
    // manual composer attempt sends Twilio/Meta will reject).
    out.sessionWindowHours = Math.max(
      1,
      Math.min(24, Math.floor(r.sessionWindowHours)),
    );
  }
  return out;
}

/**
 * Per-channel AI Agent operational config (enabled toggle, model, context
 * size, optional escalation overrides). One doc per channel. Admin-only.
 *
 * The shared persona lives on the profile (see ai-agent/profile/route.ts).
 * Refusing to enable a channel without a profile prompt is the safety
 * rail — we don't want a bot replying with an empty persona.
 */
export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string; channel: string }> },
) {
  const { id, channel } = await ctx.params;
  if (!isValidChannel(channel)) {
    return NextResponse.json({ error: "Unknown channel" }, { status: 404 });
  }
  const auth = await requireSubAccountAdmin(request, id);
  if (auth instanceof NextResponse) return auth;

  const config = await getChannelConfig(id, channel);
  return NextResponse.json({ config });
}

function sanitisePatch(
  input: Record<string, unknown>,
): Partial<AiChannelConfig> {
  const patch: Partial<AiChannelConfig> = {};

  if ("enabled" in input && typeof input.enabled === "boolean") {
    patch.enabled = input.enabled;
  }
  if (
    "contextMessageCount" in input &&
    typeof input.contextMessageCount === "number"
  ) {
    patch.contextMessageCount = Math.max(
      1,
      Math.min(50, Math.floor(input.contextMessageCount)),
    );
  }
  if ("modelOverride" in input) {
    const raw = input.modelOverride;
    if (raw === null || raw === "") {
      patch.modelOverride = null;
    } else if (typeof raw === "string") {
      patch.modelOverride = raw.trim().slice(0, 100);
    }
  }
  if ("escalationKeywordsOverride" in input) {
    const raw = input.escalationKeywordsOverride;
    if (raw === null) {
      patch.escalationKeywordsOverride = null;
    } else if (Array.isArray(raw)) {
      patch.escalationKeywordsOverride = raw
        .filter((v): v is string => typeof v === "string")
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
        .slice(0, 25);
    }
  }
  if ("escalationNotifyEmailOverride" in input) {
    const raw = input.escalationNotifyEmailOverride;
    if (raw === null || raw === "") {
      patch.escalationNotifyEmailOverride = null;
    } else if (typeof raw === "string") {
      const trimmed = raw.trim();
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
        patch.escalationNotifyEmailOverride = trimmed;
      }
    }
  }
  // Web-chat-only block. Merge over the existing webChat object so a
  // partial PATCH (e.g. just the welcomeMessage) doesn't wipe the other
  // fields. The merge happens server-side after we re-read.
  if ("webChat" in input) {
    const block = sanitiseWebChatBlock(input.webChat);
    if (Object.keys(block).length > 0) {
      // Stamp as Partial — the merge with the existing doc happens in
      // the PATCH handler below where we have the current config.
      patch.webChat = block as WebChatChannelConfig;
    }
  }

  // Voice-only block. Same merge semantics as webChat — partial PATCH
  // preserves untouched fields. vapiAssistantId / vapiPhoneNumberId
  // are stamped by the provisioning side-effect below, never accepted
  // from the inbound body (sanitiseVoiceBlock strips them).
  if ("voice" in input) {
    const block = sanitiseVoiceBlock(input.voice);
    if (Object.keys(block).length > 0) {
      patch.voice = block as VoiceChannelConfig;
    }
  }

  // WhatsApp-only block. Same merge semantics as webChat/voice.
  if ("whatsapp" in input) {
    const block = sanitiseWhatsappBlock(input.whatsapp);
    if (Object.keys(block).length > 0) {
      patch.whatsapp = block as WhatsappChannelConfig;
    }
  }

  return patch;
}

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string; channel: string }> },
) {
  const { id, channel } = await ctx.params;
  if (!isValidChannel(channel)) {
    return NextResponse.json({ error: "Unknown channel" }, { status: 404 });
  }
  const auth = await requireSubAccountAdmin(request, id);
  if (auth instanceof NextResponse) return auth;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const patch = sanitisePatch(body);
  if (Object.keys(patch).length === 0) {
    return NextResponse.json(
      { error: "No valid fields in patch" },
      { status: 400 },
    );
  }

  // Enabling a channel without a profile prompt = bot would call the LLM
  // with empty persona. Block at the API level so the UX can't bypass it
  // via direct API calls.
  if (patch.enabled === true) {
    const profile = await getAgentProfile(id);
    if (!profile || !profile.systemPrompt.trim()) {
      return NextResponse.json(
        {
          error:
            "Set the Agent persona on the Overview page before enabling this channel.",
        },
        { status: 400 },
      );
    }
  }

  // For web-chat, merge the inbound partial webChat block with the
  // existing one so a one-field PATCH doesn't blow away the others.
  // Also seed defaults on first save so the doc always has every field.
  if (channel === "web-chat" && patch.webChat) {
    const existing = await getChannelConfig(id, channel);
    const base: WebChatChannelConfig =
      existing?.webChat ?? { ...DEFAULT_WEB_CHAT_CONFIG };
    patch.webChat = { ...base, ...patch.webChat };
  }

  // WhatsApp: merge-with-existing (like web-chat), plus enable gates —
  // the agency must have flipped the WhatsApp gate on, and the sub-account
  // must have a configured Twilio WhatsApp sender (creds + sender number).
  if (channel === "whatsapp") {
    if (patch.whatsapp) {
      const existing = await getChannelConfig(id, channel);
      const base: WhatsappChannelConfig =
        existing?.whatsapp ?? { ...DEFAULT_WHATSAPP_CONFIG };
      patch.whatsapp = { ...base, ...patch.whatsapp };
    }
    if (patch.enabled === true) {
      const saSnap = await getAdminDb().doc(`subAccounts/${id}`).get();
      const sa = saSnap.exists ? (saSnap.data() as SubAccountDoc) : null;
      if (sa?.whatsappEnabledByAgency !== true) {
        return NextResponse.json(
          {
            error:
              "WhatsApp is disabled for this sub-account by your agency. Ask your agency owner to enable it.",
          },
          { status: 403 },
        );
      }
      if (!subAccountWhatsappIsConfigured(sa?.twilioConfig)) {
        return NextResponse.json(
          {
            error:
              "Add a WhatsApp sender number under Settings → SMS before enabling the WhatsApp channel. WhatsApp reuses your Twilio credentials.",
          },
          { status: 400 },
        );
      }
    }
  }

  // Voice: same merge-with-existing as web-chat. The gates depend on
  // numberMode — twilio-byoc requires a dedicated Twilio number on
  // this sub-account; vapi-managed requires the operator to have
  // pasted a Vapi phone-number id. Resolved mode = inbound patch wins,
  // else existing config, else default ("twilio-byoc").
  let subAccount: SubAccountDoc | null = null;
  if (channel === "voice") {
    const saSnap = await getAdminDb().doc(`subAccounts/${id}`).get();
    subAccount = saSnap.exists ? (saSnap.data() as SubAccountDoc) : null;

    const existingForGate = await getChannelConfig(id, channel);
    if (patch.voice) {
      const base: VoiceChannelConfig =
        existingForGate?.voice ?? { ...DEFAULT_VOICE_CONFIG };
      patch.voice = { ...base, ...patch.voice };
    }
    const resolvedVoice: VoiceChannelConfig =
      patch.voice ?? existingForGate?.voice ?? { ...DEFAULT_VOICE_CONFIG };

    if (patch.enabled === true) {
      if (!vapiIsConfigured()) {
        return NextResponse.json(
          {
            error:
              "Vapi isn't configured on this deployment. Set VAPI_API_KEY and VAPI_WEBHOOK_SECRET in your environment, then try again.",
          },
          { status: 503 },
        );
      }
      if (resolvedVoice.numberMode === "twilio-byoc") {
        if (!subAccount?.twilioConfig?.enabled) {
          return NextResponse.json(
            {
              error:
                "Configure your dedicated Twilio number under Settings → SMS before enabling Voice in BYOC mode. Voice attaches to the same number.",
            },
            { status: 400 },
          );
        }
      } else if (resolvedVoice.numberMode === "vapi-managed") {
        if (!resolvedVoice.vapiPhoneNumberId) {
          return NextResponse.json(
            {
              error:
                "Paste your Vapi phone number ID before enabling Voice in vapi-managed mode. Find it under Vapi dashboard → Phone Numbers.",
            },
            { status: 400 },
          );
        }
      }
    }
  }

  await upsertChannelConfig(id, channel, patch);

  // Voice provisioning side-effect — runs after the doc is persisted so
  // the operator's settings are saved even if a Vapi round-trip blips.
  // We re-read the config because the prior upsert may have just seeded
  // the voice block from defaults.
  if (channel === "voice" && subAccount) {
    const sideEffectError = await runVoiceProvisioningSideEffect({
      subAccountId: id,
      subAccount,
      enabled: patch.enabled,
    });
    if (sideEffectError) {
      return NextResponse.json({ error: sideEffectError }, { status: 502 });
    }
  }

  const updated = await getChannelConfig(id, channel);
  return NextResponse.json({ ok: true, config: updated });
}

/**
 * Create / update / tear down the Vapi assistant + BYOC phone-number
 * resources for this sub-account based on the latest voice channel
 * state. Idempotent — safe to run on every voice PATCH. Returns a
 * human-readable error string on failure (caller surfaces it as a 502
 * so the operator knows the settings saved but Vapi didn't sync).
 */
async function runVoiceProvisioningSideEffect(input: {
  subAccountId: string;
  subAccount: SubAccountDoc;
  enabled: boolean | undefined;
}): Promise<string | null> {
  const { subAccountId, subAccount } = input;

  const current = await getChannelConfig(subAccountId, "voice");
  const voice: VoiceChannelConfig | null = current?.voice ?? null;
  const channelEnabled = current?.enabled === true;
  const mode = voice?.numberMode ?? "twilio-byoc";

  // If the channel is disabled, tear down any provisioned Vapi
  // resources so an idle config doesn't keep accruing Vapi spend.
  // The teardown shape depends on numberMode — we only own the
  // phone-number resource in BYOC mode; in vapi-managed mode the
  // operator owns it, so we unbind instead of delete.
  if (!channelEnabled) {
    if (voice?.vapiPhoneNumberId) {
      if (mode === "twilio-byoc") {
        await deleteVapiPhoneNumber(voice.vapiPhoneNumberId);
      } else {
        await unbindVapiPhoneNumber(voice.vapiPhoneNumberId);
      }
    }
    if (voice?.vapiAssistantId)
      await deleteVapiAssistant(voice.vapiAssistantId);
    if (voice?.vapiPhoneNumberId || voice?.vapiAssistantId) {
      const cleared: VoiceChannelConfig = {
        ...(voice ?? DEFAULT_VOICE_CONFIG),
        vapiAssistantId: null,
        // Preserve the operator-pasted id in vapi-managed mode so they
        // don't have to re-paste on re-enable. Clear it in BYOC mode
        // (we owned it and just deleted it).
        vapiPhoneNumberId:
          mode === "vapi-managed" ? voice?.vapiPhoneNumberId ?? null : null,
      };
      await upsertChannelConfig(subAccountId, "voice", { voice: cleared });
    }
    return null;
  }

  // Channel is enabled — provision (or refresh) Vapi assistant + the
  // phone-number binding appropriate to numberMode. Re-read the
  // profile here so the freshest persona / KB hits Vapi's assistant
  // config in case the operator just updated either.
  const profile = await getAgentProfile(subAccountId);
  if (!profile || !profile.systemPrompt.trim()) {
    return "Set the Agent persona on the Overview page before enabling Voice.";
  }
  if (!voice) {
    return "Voice config missing — try saving again.";
  }
  if (mode === "twilio-byoc" && !subAccount.twilioConfig?.enabled) {
    return "Dedicated Twilio number is required for voice in BYOC mode.";
  }
  if (mode === "vapi-managed" && !voice.vapiPhoneNumberId) {
    return "Vapi phone number ID is required for voice in vapi-managed mode.";
  }

  try {
    const { assistantId } = await ensureVapiAssistant({
      subAccountId,
      profile,
      voice,
      modelOverride: current?.modelOverride ?? null,
      existingAssistantId: voice.vapiAssistantId,
    });

    let phoneNumberId: string;
    if (mode === "twilio-byoc") {
      // We own the resource — create-or-update via BYOC creds.
      if (!subAccount.twilioConfig) {
        return "Dedicated Twilio config disappeared mid-save.";
      }
      const result = await ensureVapiPhoneNumber({
        subAccountId,
        twilioConfig: subAccount.twilioConfig,
        assistantId,
        existingPhoneNumberId: voice.vapiPhoneNumberId,
      });
      phoneNumberId = result.phoneNumberId;
    } else {
      // Operator owns the resource — just bind our assistant to it.
      // voice.vapiPhoneNumberId is guaranteed by the gate above.
      const result = await bindVapiAssistantToPhoneNumber({
        phoneNumberId: voice.vapiPhoneNumberId!,
        assistantId,
      });
      phoneNumberId = result.phoneNumberId;
    }

    const stamped: VoiceChannelConfig = {
      ...voice,
      vapiAssistantId: assistantId,
      vapiPhoneNumberId: phoneNumberId,
    };
    await upsertChannelConfig(subAccountId, "voice", { voice: stamped });
    return null;
  } catch (err) {
    const detail =
      err instanceof VapiError
        ? `${err.message}${err.body ? `: ${err.body.slice(0, 200)}` : ""}`
        : err instanceof Error
          ? err.message
          : "Unknown error";
    console.error(
      `[ai-agent/channels/voice] Vapi provisioning failed sa=${subAccountId}: ${detail}`,
    );
    return `Vapi provisioning failed: ${detail}`;
  }
}
