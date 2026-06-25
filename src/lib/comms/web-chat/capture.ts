import "server-only";

import {
  parseCaptureMarker as _parseCaptureMarker,
  parseFormMarker as _parseFormMarker,
  reconcileContactFromCapture as _reconcileContactFromCapture,
  type CaptureFieldId as _CaptureFieldId,
  type ParsedCapture as _ParsedCapture,
  type ParsedFormRequest as _ParsedFormRequest,
} from "@/lib/comms/ai/capture";
import { linkSessionToContact } from "@/lib/comms/web-chat/session";

/**
 * Web-chat capture surface — thin wrappers over the channel-agnostic
 * primitives in `@/lib/comms/ai/capture`. The wrappers exist so web-chat
 * callers can reconcile a contact AND link the session row in one call;
 * the underlying generic reconciler deliberately doesn't know about
 * webChatSessions.
 *
 * Voice imports the generic primitives directly and writes to
 * voiceCalls/{callId} itself — no wrappers needed there.
 */

export type CaptureFieldId = _CaptureFieldId;
export type ParsedCapture = _ParsedCapture;
export type ParsedFormRequest = _ParsedFormRequest;

export const parseCaptureMarker = _parseCaptureMarker;
export const parseFormMarker = _parseFormMarker;

export interface ReconcileInput {
  agencyId: string;
  subAccountId: string;
  sessionId: string;
  /** When non-null, the session already has a contact and we skip. */
  existingContactId: string | null;
  pageUrl: string | null;
  capture: NonNullable<ParsedCapture["capture"]>;
}

export interface ReconcileResult {
  contactId: string;
  /** True when this call created a fresh Contact. False when an existing
   *  email-match was reused or the session was already linked. */
  created: boolean;
}

export async function reconcileContactFromCapture(
  input: ReconcileInput,
): Promise<ReconcileResult | null> {
  const result = await _reconcileContactFromCapture({
    agencyId: input.agencyId,
    subAccountId: input.subAccountId,
    existingContactId: input.existingContactId,
    pageUrl: input.pageUrl,
    source: "web-chat",
    matchStrategy: "email-first",
    capture: input.capture,
  });
  if (!result) return null;

  await linkSessionToContact({
    subAccountId: input.subAccountId,
    sessionId: input.sessionId,
    contactId: result.contactId,
    capturedName: input.capture.name,
    capturedEmail: input.capture.email,
    capturedPhone: input.capture.phone,
  });

  return result;
}
