import "server-only";

import { NextResponse } from "next/server";
import { FieldValue, type Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireContactAccessible, requireUid } from "@/lib/comms/route-auth";
import { sendMetaMessage } from "@/lib/comms/meta";
import { upsertConversationForMessage } from "@/lib/server/conversations-service";
import type { ActivityType } from "@/types/contacts";
import type { SubAccountDoc } from "@/types";

type MetaChannel = "messenger" | "instagram";
type Body = { contactId?: string; body?: string; channel?: string };

/**
 * Send a manual reply on the BETA Facebook Messenger / Instagram DM channels.
 *
 * Guards mirror the WhatsApp send route, adapted for Meta:
 *   1. Agency gate `metaInboxEnabledByAgency` must be on (403).
 *   2. The sub-account must have a connected Page (`metaConfig`) — and, for
 *      Instagram, a linked IG account (503).
 *   3. The contact must carry a `metaUserId` (they've messaged us) (400).
 *   4. Meta's 24-hour standard messaging window — free-form replies are only
 *      allowed within 24h of the contact's last inbound on that channel (409).
 *      Re-opening outside the window needs message tags (a later release).
 *
 * On success: sends via the Graph API, writes an outbound row to
 * `contacts/{id}/metaMessages`, an activity entry, and updates the unified
 * inbox index (pauseBot so the human takeover holds).
 */

const WINDOW_MS = 24 * 60 * 60 * 1000;

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
  const channel: MetaChannel =
    payload.channel === "instagram" ? "instagram" : "messenger";

  if (!contactId || !body) {
    return NextResponse.json(
      { error: "contactId and body are required" },
      { status: 400 },
    );
  }

  const contact = await requireContactAccessible(auth.uid, contactId);
  if (contact instanceof NextResponse) return contact;

  if (!contact.metaUserId) {
    return NextResponse.json(
      { error: "This contact hasn't messaged via Facebook/Instagram." },
      { status: 400 },
    );
  }

  const db = getAdminDb();
  const subAccountSnap = await db
    .doc(`subAccounts/${contact.subAccountId}`)
    .get();
  const subAccount = subAccountSnap.exists
    ? (subAccountSnap.data() as SubAccountDoc)
    : null;

  if (subAccount?.metaInboxEnabledByAgency !== true) {
    return NextResponse.json(
      {
        error:
          "The Facebook/Instagram inbox is disabled for this sub-account by your agency.",
      },
      { status: 403 },
    );
  }

  const cfg = subAccount?.metaConfig ?? null;
  if (!cfg?.connected || !cfg.pageAccessToken) {
    return NextResponse.json(
      {
        error:
          "No Facebook Page is connected. Connect one under Settings → Messaging.",
      },
      { status: 503 },
    );
  }
  const fromNodeId =
    channel === "instagram" ? cfg.instagramBusinessAccountId : cfg.pageId;
  if (!fromNodeId) {
    return NextResponse.json(
      {
        error:
          channel === "instagram"
            ? "No Instagram business account is linked to the connected Page."
            : "The connected Page is missing its id — reconnect under Settings → Messaging.",
      },
      { status: 503 },
    );
  }

  // 24-hour window guard. Find the most recent INBOUND on this channel; scan in
  // code over a single-field (auto-indexed) createdAt order so no composite
  // index is needed.
  const recent = await db
    .collection(`contacts/${contactId}/metaMessages`)
    .orderBy("createdAt", "desc")
    .limit(50)
    .get();
  let latestInboundMs: number | null = null;
  for (const d of recent.docs) {
    const m = d.data() as {
      direction?: string;
      channel?: string;
      createdAt?: Timestamp;
    };
    if (m.direction === "inbound" && m.channel === channel) {
      latestInboundMs = m.createdAt?.toDate?.().getTime() ?? null;
      break;
    }
  }
  if (latestInboundMs === null || Date.now() - latestInboundMs >= WINDOW_MS) {
    return NextResponse.json(
      {
        error:
          "Meta's 24-hour messaging window is closed — the contact hasn't messaged within that time. Re-opening the conversation needs a message tag (coming in a later release).",
        code: "session_window_closed",
      },
      { status: 409 },
    );
  }

  let messageId: string;
  try {
    messageId = await sendMetaMessage({
      channel,
      fromNodeId,
      recipientId: contact.metaUserId,
      text: body,
      pageAccessToken: cfg.pageAccessToken,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to send message.";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  const preview = body.length > 80 ? `${body.slice(0, 80)}…` : body;
  const label = channel === "instagram" ? "Instagram" : "Messenger";

  try {
    await db
      .collection("contacts")
      .doc(contactId)
      .collection("activities")
      .add({
        type: (channel === "instagram"
          ? "instagram_sent"
          : "messenger_sent") satisfies ActivityType,
        content: `${label}: ${preview}`,
        createdBy: auth.uid,
        meta: { messageId },
        createdAt: FieldValue.serverTimestamp(),
      });
  } catch (err) {
    console.warn("[meta/send] activity write failed", err);
  }

  try {
    await db
      .collection("contacts")
      .doc(contactId)
      .collection("metaMessages")
      .doc(messageId)
      .set({
        agencyId: contact.agencyId,
        subAccountId: contact.subAccountId,
        contactId,
        channel,
        direction: "outbound",
        status: "sent",
        body,
        from: fromNodeId,
        to: contact.metaUserId,
        metaMessageId: messageId,
        sentByUid: auth.uid,
        error: null,
        readAt: null,
        createdAt: FieldValue.serverTimestamp(),
      });
  } catch (err) {
    console.warn("[meta/send] message-row write failed", err);
  }

  await upsertConversationForMessage({
    contactId,
    subAccountId: contact.subAccountId,
    agencyId: contact.agencyId,
    contactName: contact.name ?? "",
    contactPhone: contact.phone || null,
    channel,
    direction: "outbound",
    body,
    pauseBot: true,
  });

  return NextResponse.json({ ok: true, messageId });
}
