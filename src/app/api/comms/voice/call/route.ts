import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";

import { getAdminDb } from "@/lib/firebase/admin";
import { requireContactAccessible, requireUid } from "@/lib/comms/route-auth";
import { getAgentProfile, getChannelConfig } from "@/lib/comms/ai/agent";
import { vapiIsConfigured, createOutboundCall } from "@/lib/comms/voice/vapi";
import { checkOutboundCompliance } from "@/lib/comms/voice/outbound-compliance";
import type { SubAccountDoc } from "@/types";

type Body = { contactId?: string; consentAck?: boolean };

/**
 * Place an outbound AI voice call to a contact (operator-initiated
 * click-to-call). Mirrors the SMS send route's auth + 503 pattern.
 *
 * Gates, in order:
 *   1. Authenticated + can access the contact.
 *   2. Agency gate `outboundVoiceEnabledByAgency === true` (403 otherwise).
 *   3. Voice channel `voice.outboundEnabled === true` (403 otherwise).
 *   4. Vapi configured + the inbound assistant/number provisioned (503/400).
 *   5. Native compliance gate (opt-out, consent, window, caps) — 422 with
 *      a machine-readable `code` + human `reason` when it blocks. No Vapi
 *      minutes are spent on a blocked call.
 *
 * On success: places the call (reusing the inbound assistant + number),
 * writes a `voiceCalls/{callId}` placeholder doc (direction "outbound",
 * linked to the contact) so the per-number/daily caps count it and the
 * operator console shows it, plus a `voice_call_initiated` activity row.
 */
export async function POST(request: Request) {
  const auth = requireUid(request);
  if (auth instanceof NextResponse) return auth;

  let payload: Body;
  try {
    payload = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const contactId = payload.contactId?.trim();
  if (!contactId) {
    return NextResponse.json(
      { error: "contactId is required" },
      { status: 400 },
    );
  }

  const contact = await requireContactAccessible(auth.uid, contactId);
  if (contact instanceof NextResponse) return contact;

  const db = getAdminDb();

  // Agency gate.
  const saSnap = await db.doc(`subAccounts/${contact.subAccountId}`).get();
  const subAccount = saSnap.exists ? (saSnap.data() as SubAccountDoc) : null;
  if (subAccount?.outboundVoiceEnabledByAgency !== true) {
    return NextResponse.json(
      {
        error:
          "Outbound calling is disabled for this workspace. Ask your agency owner to enable it.",
      },
      { status: 403 },
    );
  }

  // Voice channel config + outbound enablement.
  const channel = await getChannelConfig(contact.subAccountId, "voice");
  const voice = channel?.voice ?? null;
  if (!voice || voice.outboundEnabled !== true) {
    return NextResponse.json(
      { error: "Outbound calling isn't enabled in the Voice settings." },
      { status: 403 },
    );
  }

  // Vapi + provisioning prerequisites.
  if (!vapiIsConfigured()) {
    return NextResponse.json(
      { error: "Voice calling isn't configured on this deployment." },
      { status: 503 },
    );
  }
  if (!voice.vapiAssistantId || !voice.vapiPhoneNumberId) {
    return NextResponse.json(
      {
        error:
          "Enable the Voice channel first so the calling number is provisioned.",
      },
      { status: 400 },
    );
  }

  // Native compliance gate.
  const profile = await getAgentProfile(contact.subAccountId);
  const agentTimezone =
    profile?.timezone || voice.outboundWindow?.timezone || "UTC";
  const compliance = await checkOutboundCompliance({
    subAccountId: contact.subAccountId,
    contact,
    voice,
    agentTimezone,
    consentAck: payload.consentAck === true,
  });
  if (!compliance.allowed) {
    return NextResponse.json(
      {
        ok: false,
        code: compliance.code,
        error: compliance.reason,
        retryAfterSec: compliance.retryAfterSec ?? null,
      },
      { status: 422 },
    );
  }

  const customerNumber = compliance.e164 ?? contact.phone;

  // Place the call.
  let callId: string;
  try {
    const result = await createOutboundCall({
      assistantId: voice.vapiAssistantId,
      phoneNumberId: voice.vapiPhoneNumberId,
      customerNumber,
      contactId,
      firstMessage: voice.outboundFirstMessage,
    });
    callId = result.callId;
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to place the call";
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }

  // Placeholder voiceCalls doc — written immediately so the per-number /
  // daily caps count this call and the operator console shows it. The
  // end-of-call webhook later merges in the summary + extraction.
  // callerPhone holds the EXTERNAL party (the contact) — consistent with
  // inbound — so the frequency query (callerPhone === number) works for
  // both directions.
  try {
    await db
      .doc(`subAccounts/${contact.subAccountId}/voiceCalls/${callId}`)
      .set(
        {
          id: callId,
          agencyId: contact.agencyId,
          subAccountId: contact.subAccountId,
          callId,
          direction: "outbound",
          callerPhone: customerNumber,
          toPhone: null,
          durationSec: 0,
          summary: null,
          endedReason: null,
          contactId,
          contactCreated: false,
          callbackRequested: false,
          capturedName: null,
          capturedEmail: null,
          capturedPhone: null,
          taskId: null,
          escalationEmailSent: false,
          transcript: [],
          liveStatus: "queued",
          liveStatusAt: FieldValue.serverTimestamp(),
          // Audit: who placed the call + that consent was acknowledged.
          initiatedByUid: auth.uid,
          consentAck: true,
          errors: [],
          createdAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
  } catch (err) {
    console.warn("[voice/call] placeholder doc write failed", err);
  }

  // Activity row on the contact timeline.
  try {
    await db
      .collection("contacts")
      .doc(contactId)
      .collection("activities")
      .add({
        type: "voice_call_initiated",
        content: "Outbound AI call placed",
        createdBy: auth.uid,
        meta: { callId },
        createdAt: FieldValue.serverTimestamp(),
      });
  } catch (err) {
    console.warn("[voice/call] activity write failed", err);
  }

  // Stamp the contact for cross-campaign suppression (click-to-call counts
  // as a recent outbound touch; campaign id is null for one-off calls).
  await db
    .collection("contacts")
    .doc(contactId)
    .update({
      lastOutboundCallAt: FieldValue.serverTimestamp(),
      lastOutboundCampaignId: null,
    })
    .catch((err) => console.warn("[voice/call] contact stamp failed", err));

  return NextResponse.json({ ok: true, callId });
}
