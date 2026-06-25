import { NextResponse } from "next/server";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import {
  getAgentProfile,
  getChannelConfig,
  type ConfiguredChannelId,
} from "@/lib/comms/ai/agent";
import { aiIsConfigured, callAi } from "@/lib/comms/ai/openrouter";
import { buildSystemPrompt } from "@/lib/comms/ai/prompt";
import { getAdminDb } from "@/lib/firebase/admin";
import { DEFAULT_AI_CHANNEL_CONFIG } from "@/types/ai";
import type { ResolvedAiAgent } from "@/types/ai";
import type { SubAccountDoc } from "@/types";

export const dynamic = "force-dynamic";

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

  let body: { message?: string; channel?: string };
  try {
    body = (await request.json()) as { message?: string; channel?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const message = body.message?.trim();
  if (!message) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  const profile = await getAgentProfile(id);
  if (!profile || !profile.systemPrompt.trim()) {
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

  const saSnap = await getAdminDb().doc(`subAccounts/${id}`).get();
  const subAccount = saSnap.data() as SubAccountDoc | undefined;

  // Synthesize a ResolvedAiAgent for the dry-run. When the channel config
  // doesn't exist yet (operator hasn't enabled it), fall back to defaults
  // so the test still works.
  const effectiveChannel = channel ?? {
    ...DEFAULT_AI_CHANNEL_CONFIG,
    createdAt: null,
    updatedAt: null,
  };
  const agent: ResolvedAiAgent = {
    profile,
    channel: effectiveChannel,
    effective: {
      enabled: effectiveChannel.enabled,
      systemPrompt: profile.systemPrompt,
      businessName: profile.businessName,
      hoursStart: profile.hoursStart,
      hoursEnd: profile.hoursEnd,
      timezone: profile.timezone,
      escalationKeywords:
        effectiveChannel.escalationKeywordsOverride ?? profile.escalationKeywords,
      escalationNotifyEmail:
        effectiveChannel.escalationNotifyEmailOverride ??
        profile.escalationNotifyEmail,
      contextMessageCount: effectiveChannel.contextMessageCount,
      modelOverride: effectiveChannel.modelOverride,
      websiteKb: profile.websiteKb ?? null,
    },
  };

  const systemPrompt = buildSystemPrompt({
    agent,
    channelId,
    fallbackBusinessName: subAccount?.name ?? "the business",
    contactContextBlock: null,
  });

  try {
    const completion = await callAi({
      model: channel?.modelOverride ?? undefined,
      messages: [
        { role: "system", content: systemPrompt },
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
