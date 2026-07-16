import { NextResponse } from "next/server";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import {
  getAgentProfile,
  getChannelConfig,
  type ConfiguredChannelId,
} from "@/lib/comms/ai/agent";
import {
  aiIsConfigured,
  callAi,
  type AiChatMessage,
} from "@/lib/comms/ai/openrouter";
import { buildSystemPrompt } from "@/lib/comms/ai/prompt";
import { retrieveRelevantChunks } from "@/lib/knowledge-base/retrieve";
import { getAdminDb } from "@/lib/firebase/admin";
import { compileBusinessProfilePrompt } from "@/lib/business-profile/compile";
import {
  DEFAULT_AI_AGENT_PROFILE,
  DEFAULT_AI_CHANNEL_CONFIG,
} from "@/types/ai";
import type { AiAgentProfile } from "@/types/ai";
import type { ResolvedAiAgent } from "@/types/ai";
import type { BusinessProfileContent } from "@/types/business-profile";
import type { SubAccountDoc } from "@/types";

export const dynamic = "force-dynamic";

interface TestTurn {
  role?: string;
  content?: string;
}

interface TestBody {
  message?: string;
  channel?: string;
  history?: TestTurn[];
  draftProfile?: Record<string, unknown>;
}

function str(value: unknown, max = 4000): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function strArray(value: unknown, maxItems = 20, maxChars = 200): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim().slice(0, maxChars))
    .filter(Boolean)
    .slice(0, maxItems);
}

function num(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizeDraftProfile(
  draft: Record<string, unknown> | undefined,
  fallback: AiAgentProfile | null,
): AiAgentProfile | null {
  if (!draft) return fallback;

  const base: AiAgentProfile =
    fallback ??
    ({
      ...DEFAULT_AI_AGENT_PROFILE,
      websiteUrl: null,
      websiteKb: null,
      websiteKbFetchedAt: null,
      createdAt: null,
      updatedAt: null,
    } as AiAgentProfile);

  return {
    ...base,
    systemPrompt: str(draft.systemPrompt ?? base.systemPrompt, 8000),
    businessName: str(draft.businessName ?? base.businessName, 200),
    hoursStart: num(draft.hoursStart, base.hoursStart),
    hoursEnd: num(draft.hoursEnd, base.hoursEnd),
    timezone: str(draft.timezone ?? base.timezone, 100),
    escalationKeywords:
      strArray(draft.escalationKeywords, 20, 100) || base.escalationKeywords,
    escalationNotifyEmail:
      str(draft.escalationNotifyEmail ?? base.escalationNotifyEmail, 200) || null,
  };
}

/**
 * Dry-run the agent against a single test message. Calls the LLM with
 * the saved persona + safety rails, but does NOT send Twilio SMS, touch
 * any contact's chat thread, or bump token counters. Used by the
 * Overview's "Test this prompt" panel.
 */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const auth = await requireSubAccountAdmin(request, id);
  if (auth instanceof NextResponse) return auth;

  if (!aiIsConfigured()) {
    return NextResponse.json(
      { error: "OPENROUTER_API_KEY is not set on this deployment." },
      { status: 503 },
    );
  }

  let body: TestBody;
  try {
    body = (await request.json()) as TestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const message = body.message?.trim();
  if (!message) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  const profile = await getAgentProfile(id);
  const effectiveProfile = normalizeDraftProfile(body.draftProfile, profile);

  if (!effectiveProfile || !effectiveProfile.systemPrompt.trim()) {
    return NextResponse.json(
      { error: "Set the Agent persona on the Overview page first." },
      { status: 400 },
    );
  }

  // Channel choice for the test. Default to SMS — the only shipped channel
  // until web-chat lands. The operator can target web-chat too for a
  // length/markdown sanity check of the persona.
  const channelId: ConfiguredChannelId =
    body.channel === "web-chat" ? "web-chat" : "sms";
  const channel = await getChannelConfig(id, channelId);

  const db = getAdminDb();
  const [saSnap, bizSnap] = await Promise.all([
    db.doc(`subAccounts/${id}`).get(),
    db.doc(`subAccounts/${id}/businessProfile/main`).get(),
  ]);
  const subAccount = saSnap.data() as SubAccountDoc | undefined;
  // Compile the central Knowledge Base so the dry-run reflects exactly what
  // the live agent receives.
  const businessKnowledge = bizSnap.exists
    ? compileBusinessProfilePrompt(bizSnap.data() as BusinessProfileContent)
    : null;

  // Synthesize a ResolvedAiAgent for the dry-run. When the channel config
  // doesn't exist yet (operator hasn't enabled it), fall back to defaults
  // so the test still works.
  const effectiveChannel = channel ?? {
    ...DEFAULT_AI_CHANNEL_CONFIG,
    createdAt: null,
    updatedAt: null,
  };
  const agent: ResolvedAiAgent = {
    profile: effectiveProfile,
    channel: effectiveChannel,
    effective: {
      enabled: effectiveChannel.enabled,
      systemPrompt: effectiveProfile.systemPrompt,
      businessName: effectiveProfile.businessName,
      hoursStart: effectiveProfile.hoursStart,
      hoursEnd: effectiveProfile.hoursEnd,
      timezone: effectiveProfile.timezone,
      escalationKeywords:
        effectiveChannel.escalationKeywordsOverride ??
        effectiveProfile.escalationKeywords,
      escalationNotifyEmail:
        effectiveChannel.escalationNotifyEmailOverride ??
        effectiveProfile.escalationNotifyEmail,
      contextMessageCount: effectiveChannel.contextMessageCount,
      modelOverride: effectiveChannel.modelOverride,
      websiteKb: effectiveProfile.websiteKb ?? null,
      businessKnowledge,
    },
  };

  const retrievedChunks = await retrieveRelevantChunks(id, message);

  const systemPrompt = buildSystemPrompt({
    agent,
    channelId,
    fallbackBusinessName: subAccount?.name ?? "the business",
    contactContextBlock: null,
    retrievedChunks,
  });

  const historyMessages: AiChatMessage[] = (
    Array.isArray(body.history) ? body.history : []
  )
    .map((turn): AiChatMessage | null => {
      const content = str(turn.content, 2000);
      if (!content) return null;
      return {
        role: turn.role === "assistant" ? "assistant" : "user",
        content,
      };
    })
    .filter((turn): turn is AiChatMessage => turn !== null)
    .slice(-8);

  try {
    const completion = await callAi({
      model: channel?.modelOverride ?? undefined,
      messages: [
        { role: "system", content: systemPrompt },
        ...historyMessages,
        { role: "user", content: message },
      ],
    });
    return NextResponse.json({
      ok: true,
      reply: completion.text,
      model: completion.model,
      tokens: completion.totalTokens,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
