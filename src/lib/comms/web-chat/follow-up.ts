import "server-only";

import {
  createCaptureFollowUp,
  type CaptureFollowUpResult,
} from "@/lib/comms/ai/follow-up";

/**
 * Thin web-chat wrapper over the channel-agnostic
 * `createCaptureFollowUp`. Sets the web-chat-flavored labels + the
 * sessions deep-link path so the existing callers (web-chat orchestrator
 * + capture route) keep their old call shape.
 */

interface CreateFollowUpInput {
  agencyId: string;
  subAccountId: string;
  sessionId: string;
  contactId: string;
  capturedName: string | null;
  capturedEmail: string | null;
  capturedPhone: string | null;
  lastInboundMessage: string | null;
  pageUrl: string | null;
}

export type FollowUpResult = CaptureFollowUpResult;

export async function createFollowUpActions(
  input: CreateFollowUpInput,
): Promise<FollowUpResult> {
  return createCaptureFollowUp({
    agencyId: input.agencyId,
    subAccountId: input.subAccountId,
    channelId: "web-chat",
    channelLabel: "Web Chat",
    taskAction: "Follow up with",
    sessionNoun: "session",
    sessionId: input.sessionId,
    sessionDeepLinkPath: `/sa/${input.subAccountId}/ai-agents/web-chat/sessions/${input.sessionId}`,
    contactId: input.contactId,
    capturedName: input.capturedName,
    capturedEmail: input.capturedEmail,
    capturedPhone: input.capturedPhone,
    lastInboundMessage: input.lastInboundMessage,
    pageUrl: input.pageUrl,
  });
}
