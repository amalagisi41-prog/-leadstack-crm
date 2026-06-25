import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import {
  sendSmsForSubAccount,
  smsIsConfigured,
  subAccountTwilioIsConfigured,
} from "@/lib/comms/twilio";
import { requireContactAccessible, requireUid } from "@/lib/comms/route-auth";
import { recordSend } from "@/lib/comms/usage";
import { upsertConversationForMessage } from "@/lib/server/conversations-service";
import type { SubAccountDoc } from "@/types";

type Body = { contactId?: string; body?: string };

/**
 * Send an SMS from a contact profile.
 *
 * Mode selection:
 *   - If the contact's sub-account has `twilioConfig.enabled === true`, the
 *     send uses the sub-account's dedicated Twilio creds AND writes a message
 *     row to contacts/{id}/messages so the chat thread renders.
 *   - Otherwise falls back to the env-var Twilio (existing shared-sender
 *     behavior). No message row is written in shared mode — the activity
 *     timeline still records `sms_sent` so nothing visibly regresses.
 *
 * The 503 fast-path here used to gate the whole route on env-var presence;
 * we now also accept dedicated-mode sub-accounts even when env vars are
 * absent, so a deployment can run dedicated-only.
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
  const body = payload.body?.trim();

  if (!contactId || !body) {
    return NextResponse.json(
      { error: "contactId and body are required" },
      { status: 400 },
    );
  }

  const contact = await requireContactAccessible(auth.uid, contactId);
  if (contact instanceof NextResponse) return contact;

  if (!contact.phone) {
    return NextResponse.json(
      { error: "This contact has no phone number." },
      { status: 400 },
    );
  }

  // Pre-fetch the sub-account doc once so we can pass it through to
  // sendSmsForSubAccount + the message-row write below without a second read.
  const db = getAdminDb();
  const subAccountSnap = await db
    .doc(`subAccounts/${contact.subAccountId}`)
    .get();
  const subAccount = subAccountSnap.exists
    ? (subAccountSnap.data() as SubAccountDoc)
    : null;

  const dedicated = subAccountTwilioIsConfigured(subAccount?.twilioConfig);

  // Gate: if neither dedicated nor shared mode is available, return 503.
  // (Used to be just smsIsConfigured(); now we also accept dedicated-only.)
  if (!dedicated && !smsIsConfigured()) {
    return NextResponse.json(
      { error: "SMS is not configured on this deployment." },
      { status: 503 },
    );
  }

  let sid: string;
  let mode: "shared" | "dedicated";
  let fromNumber: string;
  try {
    const result = await sendSmsForSubAccount({
      subAccountId: contact.subAccountId,
      subAccount,
      to: contact.phone,
      body,
    });
    sid = result.sid;
    mode = result.mode;
    fromNumber = result.from;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to send SMS";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  const preview = body.length > 80 ? `${body.slice(0, 80)}…` : body;

  // Activity row — written for both modes so existing UIs that surface
  // sms_sent events keep working.
  try {
    await db
      .collection("contacts")
      .doc(contactId)
      .collection("activities")
      .add({
        type: "sms_sent",
        content: `SMS: ${preview}`,
        createdBy: auth.uid,
        meta: { sid, mode },
        createdAt: FieldValue.serverTimestamp(),
      });
  } catch (err) {
    console.warn("[sms/send] activity write failed", err);
  }

  // Chat-thread row — only in dedicated mode. Doc id = MessageSid so any
  // accidental retry from the same SID dedupes naturally.
  if (mode === "dedicated") {
    try {
      await db
        .collection("contacts")
        .doc(contactId)
        .collection("messages")
        .doc(sid)
        .set({
          agencyId: contact.agencyId,
          subAccountId: contact.subAccountId,
          contactId,
          direction: "outbound",
          status: "sent",
          body,
          from: fromNumber,
          to: contact.phone,
          twilioMessageSid: sid,
          sentByUid: auth.uid,
          error: null,
          readAt: null,
          createdAt: FieldValue.serverTimestamp(),
        });
    } catch (err) {
      console.warn("[sms/send] message-row write failed", err);
    }

    // Unified-inbox index — mirror this outbound into the conversation doc.
    await upsertConversationForMessage({
      contactId,
      subAccountId: contact.subAccountId,
      agencyId: contact.agencyId,
      contactName: contact.name ?? "",
      contactPhone: contact.phone,
      channel: "sms",
      direction: "outbound",
      body,
      pauseBot: true,
    });
  }

  await recordSend(auth.uid, "sms");

  return NextResponse.json({ ok: true, sid, mode });
}
