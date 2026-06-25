import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import {
  DEFAULT_AI_AGENT_PROFILE,
  DEFAULT_AI_CHANNEL_CONFIG,
  DEFAULT_VOICE_CONFIG,
  DEFAULT_WEB_CHAT_CONFIG,
  DEFAULT_WHATSAPP_CONFIG,
  type AiAgentProfile,
  type AiChannelConfig,
  type ResolvedAiAgent,
} from "@/types/ai";

const PROFILE_DOC = "profile";
// Literal union — gives us the same narrow string type without an unused
// `const SUPPORTED_CHANNELS` runtime array. If a runtime list of channels
// ever needs to exist, export the array AND derive the type from it via
// `(typeof SUPPORTED_CHANNELS)[number]`.
export type ConfiguredChannelId = "sms" | "web-chat" | "voice" | "whatsapp";

/**
 * Channel-specific default seed for a freshly-created config doc.
 * SMS uses the shared default as-is; web-chat layers on its widget defaults
 * (welcome message, accent color, allowed domains, position); voice layers
 * on greeting + Vapi voice render defaults (linkage ids stay null until
 * the first successful provisioning round-trip).
 */
function defaultsForChannel(
  channelId: ConfiguredChannelId,
): Omit<AiChannelConfig, "createdAt" | "updatedAt"> {
  if (channelId === "web-chat") {
    return { ...DEFAULT_AI_CHANNEL_CONFIG, webChat: { ...DEFAULT_WEB_CHAT_CONFIG } };
  }
  if (channelId === "voice") {
    return { ...DEFAULT_AI_CHANNEL_CONFIG, voice: { ...DEFAULT_VOICE_CONFIG } };
  }
  if (channelId === "whatsapp") {
    return {
      ...DEFAULT_AI_CHANNEL_CONFIG,
      whatsapp: { ...DEFAULT_WHATSAPP_CONFIG },
    };
  }
  return { ...DEFAULT_AI_CHANNEL_CONFIG };
}

/**
 * AI Agents = a sub-account-level identity (the profile) plus per-channel
 * operational configs that can override defaults. This module is the only
 * server-side reader/writer of either; callers should never touch the
 * Firestore docs directly.
 *
 * Lazy migration: pre-refactor configs at `aiConfig/main` are detected on
 * read and silently split into the new shape. One-time per sub-account.
 */

function profilePath(subAccountId: string): string {
  return `subAccounts/${subAccountId}/aiAgent/${PROFILE_DOC}`;
}

function channelPath(subAccountId: string, channelId: string): string {
  return `subAccounts/${subAccountId}/aiAgent/${channelId}`;
}

function legacyPath(subAccountId: string): string {
  return `subAccounts/${subAccountId}/aiConfig/main`;
}

/**
 * Lazy migration: if a sub-account still has the pre-refactor
 * `aiConfig/main` doc, split it into the new profile + sms shape on the
 * first read. Original doc is left alone so a rollback could re-read it.
 */
async function maybeMigrateLegacy(subAccountId: string): Promise<void> {
  const db = getAdminDb();
  const [profileSnap, legacySnap] = await Promise.all([
    db.doc(profilePath(subAccountId)).get(),
    db.doc(legacyPath(subAccountId)).get(),
  ]);
  if (profileSnap.exists) return; // already migrated
  if (!legacySnap.exists) return; // no legacy to migrate

  const legacy = legacySnap.data() as {
    enabled?: boolean;
    systemPrompt?: string;
    businessName?: string;
    hoursStart?: number;
    hoursEnd?: number;
    timezone?: string;
    escalationKeywords?: string[];
    escalationNotifyEmail?: string | null;
    contextMessageCount?: number;
    modelOverride?: string | null;
    totalTokensUsed?: number;
  };

  const profile: AiAgentProfile = {
    systemPrompt: legacy.systemPrompt ?? "",
    businessName: legacy.businessName ?? "",
    hoursStart: legacy.hoursStart ?? 9,
    hoursEnd: legacy.hoursEnd ?? 17,
    timezone: legacy.timezone ?? "Australia/Sydney",
    escalationKeywords: legacy.escalationKeywords ?? [
      ...DEFAULT_AI_AGENT_PROFILE.escalationKeywords,
    ],
    escalationNotifyEmail: legacy.escalationNotifyEmail ?? null,
    websiteUrl: null,
    websiteKb: null,
    websiteKbFetchedAt: null,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };

  const sms: AiChannelConfig = {
    enabled: legacy.enabled ?? false,
    contextMessageCount: legacy.contextMessageCount ?? 10,
    modelOverride: legacy.modelOverride ?? null,
    escalationKeywordsOverride: null,
    escalationNotifyEmailOverride: null,
    totalTokensUsed: legacy.totalTokensUsed ?? 0,
    webChat: null,
    voice: null,
    whatsapp: null,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };

  await Promise.all([
    db.doc(profilePath(subAccountId)).set(profile),
    db.doc(channelPath(subAccountId, "sms")).set(sms),
  ]);
  console.log(
    `[ai/agent] migrated legacy aiConfig for sub-account ${subAccountId}`,
  );
}

// ============================================================
// Profile (shared identity)
// ============================================================

export async function getAgentProfile(
  subAccountId: string,
): Promise<AiAgentProfile | null> {
  await maybeMigrateLegacy(subAccountId);
  const snap = await getAdminDb().doc(profilePath(subAccountId)).get();
  if (!snap.exists) return null;
  return snap.data() as AiAgentProfile;
}

export async function upsertAgentProfile(
  subAccountId: string,
  patch: Partial<AiAgentProfile>,
): Promise<void> {
  await maybeMigrateLegacy(subAccountId);
  const ref = getAdminDb().doc(profilePath(subAccountId));
  const existing = await ref.get();
  const seed = existing.exists
    ? {}
    : {
        ...DEFAULT_AI_AGENT_PROFILE,
        createdAt: FieldValue.serverTimestamp(),
      };
  await ref.set(
    { ...seed, ...patch, updatedAt: FieldValue.serverTimestamp() },
    { merge: true },
  );
}

// ============================================================
// Per-channel config
// ============================================================

export async function getChannelConfig(
  subAccountId: string,
  channelId: ConfiguredChannelId,
): Promise<AiChannelConfig | null> {
  await maybeMigrateLegacy(subAccountId);
  const snap = await getAdminDb()
    .doc(channelPath(subAccountId, channelId))
    .get();
  if (!snap.exists) return null;
  return snap.data() as AiChannelConfig;
}

export async function upsertChannelConfig(
  subAccountId: string,
  channelId: ConfiguredChannelId,
  patch: Partial<AiChannelConfig>,
): Promise<void> {
  await maybeMigrateLegacy(subAccountId);
  const ref = getAdminDb().doc(channelPath(subAccountId, channelId));
  const existing = await ref.get();
  const seed = existing.exists
    ? {}
    : {
        ...defaultsForChannel(channelId),
        createdAt: FieldValue.serverTimestamp(),
      };
  await ref.set(
    { ...seed, ...patch, updatedAt: FieldValue.serverTimestamp() },
    { merge: true },
  );
}

export async function incrementChannelTokens(
  subAccountId: string,
  channelId: ConfiguredChannelId,
  tokens: number,
): Promise<void> {
  if (tokens <= 0) return;
  await getAdminDb()
    .doc(channelPath(subAccountId, channelId))
    .set(
      {
        totalTokensUsed: FieldValue.increment(tokens),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
}

// ============================================================
// Resolver — the only thing respond.ts cares about
// ============================================================

/**
 * Loads profile + channel in parallel and merges them into a single
 * effective config the webhook can act on. Returns null when either
 * the profile or the channel config doesn't exist (i.e. the agent
 * hasn't been set up for this channel).
 */
export async function resolveAgent(
  subAccountId: string,
  channelId: ConfiguredChannelId,
): Promise<ResolvedAiAgent | null> {
  await maybeMigrateLegacy(subAccountId);
  const db = getAdminDb();
  const [profileSnap, channelSnap] = await Promise.all([
    db.doc(profilePath(subAccountId)).get(),
    db.doc(channelPath(subAccountId, channelId)).get(),
  ]);
  if (!profileSnap.exists || !channelSnap.exists) return null;

  const profile = profileSnap.data() as AiAgentProfile;
  const channel = channelSnap.data() as AiChannelConfig;

  return {
    profile,
    channel,
    effective: {
      enabled: channel.enabled,
      systemPrompt: profile.systemPrompt,
      businessName: profile.businessName,
      hoursStart: profile.hoursStart,
      hoursEnd: profile.hoursEnd,
      timezone: profile.timezone,
      escalationKeywords:
        channel.escalationKeywordsOverride ?? profile.escalationKeywords,
      escalationNotifyEmail:
        channel.escalationNotifyEmailOverride ?? profile.escalationNotifyEmail,
      contextMessageCount: channel.contextMessageCount,
      modelOverride: channel.modelOverride,
      websiteKb: profile.websiteKb ?? null,
    },
  };
}
