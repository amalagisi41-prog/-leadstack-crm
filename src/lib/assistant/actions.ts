export const ZACK_AI_CHANNELS = [
  "sms",
  "email",
  "web-chat",
  "voice",
  "whatsapp",
] as const;

export const ZACK_FEATURE_GATES = [
  "broadcastsEnabled",
  "outboundVoiceEnabled",
  "whatsappEnabled",
  "metaInboxEnabled",
  "websiteEnabled",
  "websiteStudioEnabled",
  "socialPlannerEnabled",
  "communityEnabled",
  "idxEnabled",
  "apiAccessEnabled",
  "emailDomainEnabled",
] as const;

export type ZackAiChannel = (typeof ZACK_AI_CHANNELS)[number];
export type ZackFeatureGate = (typeof ZACK_FEATURE_GATES)[number];

interface ZackActionBase {
  label: string;
  description: string;
}

export type ZackAction =
  | (ZackActionBase & { type: "navigate"; path: string })
  | (ZackActionBase & { type: "set_daily_briefing"; enabled: boolean })
  | (ZackActionBase & {
      type: "set_ai_channel";
      channel: ZackAiChannel;
      enabled: boolean;
    })
  | (ZackActionBase & {
      type: "set_feature_gate";
      feature: ZackFeatureGate;
      enabled: boolean;
    });

function text(value: unknown, max = 180): string | null {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, max)
    : null;
}

/** Never trust an LLM-produced action without reducing it to this allowlist. */
export function sanitizeZackAction(value: unknown): ZackAction | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const label = text(raw.label, 60);
  const description = text(raw.description, 220);
  if (!label || !description) return null;

  if (raw.type === "navigate") {
    const path = text(raw.path, 240);
    if (!path || !path.startsWith("/") || path.startsWith("//")) return null;
    return { type: "navigate", path, label, description };
  }

  if (raw.type === "set_daily_briefing" && typeof raw.enabled === "boolean") {
    return { type: raw.type, enabled: raw.enabled, label, description };
  }

  if (
    raw.type === "set_ai_channel" &&
    typeof raw.enabled === "boolean" &&
    ZACK_AI_CHANNELS.includes(raw.channel as ZackAiChannel)
  ) {
    return {
      type: raw.type,
      channel: raw.channel as ZackAiChannel,
      enabled: raw.enabled,
      label,
      description,
    };
  }

  if (
    raw.type === "set_feature_gate" &&
    typeof raw.enabled === "boolean" &&
    ZACK_FEATURE_GATES.includes(raw.feature as ZackFeatureGate)
  ) {
    return {
      type: raw.type,
      feature: raw.feature as ZackFeatureGate,
      enabled: raw.enabled,
      label,
      description,
    };
  }

  return null;
}
