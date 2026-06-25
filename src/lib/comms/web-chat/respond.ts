import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { callAi, type AiChatMessage } from "@/lib/comms/ai/openrouter";
import {
  incrementChannelTokens,
  resolveAgent,
} from "@/lib/comms/ai/agent";
import { buildContactContextBlock } from "@/lib/comms/ai/context";
import { buildSystemPrompt } from "@/lib/comms/ai/prompt";
import {
  matchEscalationKeyword,
  sendEscalationNotification,
} from "@/lib/comms/ai/escalation";
import {
  appendMessage,
  getOrCreateSession,
  loadRecentHistory,
  markCapturePromptShown,
} from "@/lib/comms/web-chat/session";
import {
  parseCaptureMarker,
  parseFormMarker,
  reconcileContactFromCapture,
  type CaptureFieldId,
} from "@/lib/comms/web-chat/capture";
import type { SubAccountDoc } from "@/types";
import type { Contact } from "@/types/contacts";
import type { WebChatSession } from "@/types/web-chat";

/**
 * Web-chat reply orchestrator. Mirrors `maybeRespondWithAi` for SMS but
 * with web-chat-specific bits:
 *
 *   - Returns the reply text instead of sending via Twilio (caller hands
 *     it back to the widget as the HTTP response body).
 *   - Persists messages to `webChatSessions/{id}/messages/*` not to a
 *     contact's chat thread.
 *   - Anonymous-first: skips the contact-context block until the session
 *     has been linked via the [[capture …]] marker.
 *   - Strips the [[capture …]] marker before storing or returning the
 *     reply, then runs contact reconciliation.
 *
 * Guards short-circuit with a structured outcome so the widget can show
 * a friendly fallback ("our team will reply soon") instead of an LLM
 * reply. The outcome is also written into the message log for debugging.
 */

export type WebChatSkipReason =
  | "agent_not_configured"
  | "channel_disabled"
  | "no_prompt"
  | "outside_hours"
  | "escalation_keyword"
  | "llm_failed";

export type WebChatOutcome =
  | {
      kind: "replied";
      replyText: string;
      tokens: number;
      contactId: string | null;
      /** When set, the widget renders an inline form below this reply
       *  for the visitor to fill in. Null on replies that don't request
       *  contact capture (most replies). */
      formFields: CaptureFieldId[] | null;
    }
  | { kind: "escalated"; keyword: string; fallbackReply: string }
  | { kind: "skipped"; reason: WebChatSkipReason; fallbackReply: string };

export interface RespondToWebChatInput {
  subAccountId: string;
  agencyId: string;
  /** Stable visitor session id (UUID generated client-side, stored in
   *  the visitor's localStorage). Created lazily on first message. */
  sessionId: string;
  /** Just-arrived inbound message from the visitor. */
  incomingMessage: string;
  /** Best-effort visitor metadata used when seeding the session. Safe
   *  to pass null fields — they get null-coalesced into the doc. */
  pageUrl: string | null;
  referrer: string | null;
  origin: string | null;
  visitorIp: string | null;
  visitorUserAgent: string | null;
}

/** Polite generic reply used when the bot can't / won't answer. Visible
 *  to the visitor so it must be neutral and brand-safe. */
const FALLBACK_REPLY =
  "Thanks for reaching out! I'll have someone from the team get back to you shortly.";

function isWithinHours(
  hoursStart: number,
  hoursEnd: number,
  timezone: string,
): boolean {
  const now = new Date();
  let hour: number;
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hour12: false,
      timeZone: timezone || "UTC",
    }).formatToParts(now);
    const hourPart = parts.find((p) => p.type === "hour");
    hour = hourPart ? Number(hourPart.value) : now.getUTCHours();
    if (!Number.isFinite(hour)) hour = now.getUTCHours();
    if (hour === 24) hour = 0;
  } catch {
    hour = now.getUTCHours();
  }
  const start = Math.max(0, Math.min(23, Math.floor(hoursStart)));
  const end = Math.max(0, Math.min(23, Math.floor(hoursEnd)));
  if (start === end) return true;
  if (start < end) return hour >= start && hour < end;
  return hour >= start || hour < end;
}

export async function respondToWebChat(
  input: RespondToWebChatInput,
): Promise<{ session: WebChatSession; outcome: WebChatOutcome }> {
  const db = getAdminDb();

  // Always get-or-create the session first so even rejected messages
  // have a thread to log against.
  const session = await getOrCreateSession({
    subAccountId: input.subAccountId,
    agencyId: input.agencyId,
    sessionId: input.sessionId,
    pageUrl: input.pageUrl,
    referrer: input.referrer,
    origin: input.origin,
    visitorIp: input.visitorIp,
    visitorUserAgent: input.visitorUserAgent,
  });

  // Persist the inbound regardless of outcome. The bot's reply (or
  // fallback) is appended at the bottom of this function.
  await appendMessage({
    subAccountId: input.subAccountId,
    agencyId: input.agencyId,
    sessionId: input.sessionId,
    direction: "inbound",
    body: input.incomingMessage,
    tokens: null,
    aiGenerated: false,
  });

  const agent = await resolveAgent(input.subAccountId, "web-chat");
  if (!agent) {
    return finalize(input, session, {
      kind: "skipped",
      reason: "agent_not_configured",
      fallbackReply: FALLBACK_REPLY,
    });
  }
  const eff = agent.effective;

  if (!eff.enabled) {
    return finalize(input, session, {
      kind: "skipped",
      reason: "channel_disabled",
      fallbackReply: FALLBACK_REPLY,
    });
  }
  if (!eff.systemPrompt.trim()) {
    return finalize(input, session, {
      kind: "skipped",
      reason: "no_prompt",
      fallbackReply: FALLBACK_REPLY,
    });
  }
  if (!isWithinHours(eff.hoursStart, eff.hoursEnd, eff.timezone)) {
    return finalize(input, session, {
      kind: "skipped",
      reason: "outside_hours",
      fallbackReply: FALLBACK_REPLY,
    });
  }

  const triggered = matchEscalationKeyword(
    input.incomingMessage,
    eff.escalationKeywords,
  );
  if (triggered) {
    // Best-effort notify; never fail the visitor's response on email errors.
    if (eff.escalationNotifyEmail) {
      const saSnap = await db.doc(`subAccounts/${input.subAccountId}`).get();
      const subAccount = saSnap.data() as SubAccountDoc | undefined;
      const appUrl =
        process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://leadstack.dev";
      void sendEscalationNotification({
        to: eff.escalationNotifyEmail,
        businessName:
          eff.businessName.trim() || subAccount?.name || "your business",
        contactName: session.capturedName ?? "(anonymous web visitor)",
        contactPhone: session.capturedPhone ?? "—",
        contactId: session.contactId ?? input.sessionId,
        subAccountId: input.subAccountId,
        triggeredKeyword: triggered,
        incomingMessage: input.incomingMessage,
        appUrl,
      }).catch((err) => {
        console.warn(
          `[web-chat/respond] escalation email failed sa=${input.subAccountId}`,
          err,
        );
      });
    }
    return finalize(input, session, {
      kind: "escalated",
      keyword: triggered,
      fallbackReply: FALLBACK_REPLY,
    });
  }

  // Load identified-contact context if the session is linked.
  let contextBlock: string | null = null;
  if (session.contactId) {
    try {
      const contactSnap = await db
        .collection("contacts")
        .doc(session.contactId)
        .get();
      if (contactSnap.exists) {
        const contact = {
          id: contactSnap.id,
          ...(contactSnap.data() as Omit<Contact, "id">),
        };
        contextBlock = await buildContactContextBlock(contact);
      }
    } catch (err) {
      console.warn(
        `[web-chat/respond] contact context build failed for ${session.contactId}`,
        err,
      );
    }
  }

  // Read history AFTER appending the inbound above — pass excludeBody so
  // we don't double-feed the just-arrived turn.
  const history = await loadRecentHistory(
    input.subAccountId,
    input.sessionId,
    eff.contextMessageCount,
    input.incomingMessage,
  );

  const saSnap = await db.doc(`subAccounts/${input.subAccountId}`).get();
  const subAccount = saSnap.data() as SubAccountDoc | undefined;

  let systemPrompt = buildSystemPrompt({
    agent,
    channelId: "web-chat",
    fallbackBusinessName: subAccount?.name ?? "the business",
    contactContextBlock: contextBlock,
  });

  // Tack a session-state hint onto the prompt when capture is already
  // done or skipped. Stops the bot pestering the visitor on follow-up
  // turns even if it forgets the "AT MOST ONCE" rule from safety rails.
  if (session.contactId) {
    systemPrompt += `\n\n--- SESSION STATE ---\nContact details for this visitor have already been captured. Do NOT emit a [[form]] or [[capture]] marker. Continue the conversation normally; the team will follow up.`;
  } else if (session.capturePromptShownAt) {
    systemPrompt += `\n\n--- SESSION STATE ---\nA capture form has already been shown to this visitor${session.captureSkipped ? " and they skipped it" : ""}. Do NOT emit another [[form]] or [[capture]] marker on this session.`;
  }

  const messages: AiChatMessage[] = [
    { role: "system", content: systemPrompt },
    ...history,
    { role: "user", content: input.incomingMessage },
  ];

  let completion;
  try {
    completion = await callAi({
      model: eff.modelOverride ?? undefined,
      messages,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error(
      `[web-chat/respond] LLM call failed sa=${input.subAccountId}: ${msg}`,
    );
    return finalize(input, session, {
      kind: "skipped",
      reason: "llm_failed",
      fallbackReply: FALLBACK_REPLY,
    });
  }

  // Run BOTH parsers — bot may have emitted form OR capture (instructed
  // to pick one; we tolerate either order if it ignores the instruction).
  const afterForm = parseFormMarker(completion.text);
  const afterCapture = parseCaptureMarker(afterForm.cleanText);
  const cleanText = afterCapture.cleanText;
  const capture = afterCapture.capture;

  // Suppress the form request if it was already shown this session, or
  // the visitor has already been linked to a contact. Belt-and-braces
  // since the prompt also tells the bot not to repeat — but bots drift.
  const formAlreadyHandled =
    !!session.contactId || !!session.capturePromptShownAt;
  const formFields = formAlreadyHandled ? null : afterForm.fields;

  let contactId = session.contactId;

  // Free-text capture marker — bot extracted volunteered details.
  if (capture) {
    try {
      const reconciled = await reconcileContactFromCapture({
        agencyId: input.agencyId,
        subAccountId: input.subAccountId,
        sessionId: input.sessionId,
        existingContactId: session.contactId,
        pageUrl: input.pageUrl,
        capture,
      });
      if (reconciled) contactId = reconciled.contactId;
    } catch (err) {
      console.warn(
        `[web-chat/respond] capture reconcile failed sa=${input.subAccountId}`,
        err,
      );
    }
  }

  // If we're going to render an inline form, stamp the session so the
  // next turn won't ask again even if the bot tries.
  if (formFields) {
    void markCapturePromptShown({
      subAccountId: input.subAccountId,
      sessionId: input.sessionId,
    }).catch(() => {});
  }

  void incrementChannelTokens(
    input.subAccountId,
    "web-chat",
    completion.totalTokens,
  );

  return finalize(input, session, {
    kind: "replied",
    replyText: cleanText,
    tokens: completion.totalTokens,
    contactId: contactId ?? null,
    formFields,
  });
}

/**
 * Persist the outbound reply (or fallback) + return the structured
 * outcome. Centralized so every code path writes the same shape.
 */
async function finalize(
  input: RespondToWebChatInput,
  session: WebChatSession,
  outcome: WebChatOutcome,
): Promise<{ session: WebChatSession; outcome: WebChatOutcome }> {
  const body =
    outcome.kind === "replied" ? outcome.replyText : outcome.kind === "escalated"
      ? outcome.fallbackReply
      : outcome.fallbackReply;
  const tokens = outcome.kind === "replied" ? outcome.tokens : null;
  const aiGenerated = outcome.kind === "replied";

  await appendMessage({
    subAccountId: input.subAccountId,
    agencyId: input.agencyId,
    sessionId: input.sessionId,
    direction: "outbound",
    body,
    tokens,
    aiGenerated,
  });

  // If we escalated or skipped, mark the session.
  if (outcome.kind === "escalated") {
    await getAdminDb()
      .doc(
        `subAccounts/${input.subAccountId}/webChatSessions/${input.sessionId}`,
      )
      .update({
        status: "escalated",
        updatedAt: FieldValue.serverTimestamp(),
      });
  }

  return { session, outcome };
}
