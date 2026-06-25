import "server-only";

import { NextResponse } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { qstashIsConfigured, verifyQStashSignature } from "@/lib/automations/qstash";
import { sendEmail, emailIsConfigured, tenantFrom } from "@/lib/comms/resend";
import { resolveMergeTags } from "@/lib/automations/merge-tags";
import { buildUnsubscribeUrl } from "@/lib/automations/unsubscribe-token";
import type {
  AgencyDoc,
  BroadcastDoc,
  BroadcastSendDoc,
  MessageTemplateDoc,
  SubAccountDoc,
} from "@/types";
import type { Contact } from "@/types/contacts";

export const dynamic = "force-dynamic";

interface StepBody {
  broadcastId?: string;
  contactId?: string;
}

/**
 * Per-recipient bulk email send. Driven by a QStash callback published from
 * /api/broadcasts/email/send. Security comes from the Upstash-Signature
 * header — the route is in PUBLIC_PATHS for the same reason
 * /api/automations/step is.
 *
 * Hot path:
 *   1. Verify signature → load broadcast + send row + contact + template + sub-account
 *   2. Idempotency-check the send row (already sent / failed / skipped → return 200)
 *   3. Re-check opt-out (operator could have flipped it between fan-out and now)
 *   4. Render merge tags + unsubscribe link → resend.emails.send()
 *   5. Update the send row + atomically increment broadcast totals
 *   6. If this row was the last queued one, flip the broadcast to "completed"
 *
 * Failures during send are caught and recorded as `status: "failed"` rather
 * than re-thrown — a single bounce shouldn't stall the rest of the batch.
 * QStash will not retry because we return 200; that's intentional. We don't
 * want one transient Resend hiccup to retry-storm the whole audience.
 */
export async function POST(request: Request) {
  if (!qstashIsConfigured()) {
    return NextResponse.json(
      { error: "QStash is not configured on this deployment." },
      { status: 503 },
    );
  }
  if (!emailIsConfigured()) {
    // Resend creds disappeared after the fan-out was scheduled. Returning
    // 503 lets QStash retry; ops can re-enable the keys without losing the
    // batch. Different from a per-recipient failure (which we record + 200).
    return NextResponse.json(
      { error: "Email is not configured." },
      { status: 503 },
    );
  }

  const signature = request.headers.get("upstash-signature");
  if (!signature) {
    return NextResponse.json(
      { error: "Missing Upstash-Signature header" },
      { status: 401 },
    );
  }
  const rawBody = await request.text();
  const valid = await verifyQStashSignature(signature, rawBody);
  if (!valid) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: StepBody;
  try {
    payload = JSON.parse(rawBody) as StepBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const broadcastId = payload.broadcastId;
  const contactId = payload.contactId;
  if (typeof broadcastId !== "string" || typeof contactId !== "string") {
    return NextResponse.json(
      { error: "Body must include broadcastId (string) and contactId (string)" },
      { status: 400 },
    );
  }

  const db = getAdminDb();
  const broadcastRef = db.collection("broadcasts").doc(broadcastId);
  const sendRef = broadcastRef.collection("sends").doc(contactId);

  const [broadcastSnap, sendSnap] = await Promise.all([
    broadcastRef.get(),
    sendRef.get(),
  ]);
  if (!broadcastSnap.exists || !sendSnap.exists) {
    // Broadcast or row was deleted between schedule and fire. Drop quietly
    // — QStash retrying won't help.
    return NextResponse.json({ ok: true, ignored: "missing" });
  }
  const broadcast = broadcastSnap.data() as BroadcastDoc;
  const send = sendSnap.data() as BroadcastSendDoc;

  // Idempotency — once a row has settled, we never re-send. Accepts both
  // QStash's automatic 5xx-retry case and a manual "rerun" attempt.
  if (send.status !== "queued") {
    return NextResponse.json({ ok: true, ignored: "already_settled" });
  }

  // Load the contact (live read — opt-out may have flipped since fan-out)
  // along with the template, sub-account, and agency for merge-tag context.
  const contactRef = db.collection("contacts").doc(contactId);
  const [contactSnap, templateSnap, subAccountSnap, agencySnap] =
    await Promise.all([
      contactRef.get(),
      db.collection("message_templates").doc(broadcast.templateId).get(),
      db.collection("subAccounts").doc(broadcast.subAccountId).get(),
      db.collection("agencies").doc(broadcast.agencyId).get(),
    ]);

  if (!contactSnap.exists) {
    await markSkipped(sendRef, broadcastRef, "contact_missing");
    await maybeMarkBroadcastCompleted(broadcastRef);
    return NextResponse.json({ ok: true, status: "skipped" });
  }
  const contact = {
    id: contactSnap.id,
    ...(contactSnap.data() as Omit<Contact, "id">),
  };

  // Live opt-out re-check. Pre-flight ran at fan-out; this catches anyone
  // who unsubscribed mid-batch via the {{unsubscribeLink}} on a prior
  // broadcast or a manual flip in the contact profile.
  if (contact.emailOptedOut) {
    await markSkipped(sendRef, broadcastRef, "opt_out");
    await maybeMarkBroadcastCompleted(broadcastRef);
    return NextResponse.json({ ok: true, status: "skipped" });
  }
  if (!contact.email) {
    await markSkipped(sendRef, broadcastRef, "no_email");
    await maybeMarkBroadcastCompleted(broadcastRef);
    return NextResponse.json({ ok: true, status: "skipped" });
  }

  if (!templateSnap.exists) {
    await markFailed(
      sendRef,
      broadcastRef,
      `Template ${broadcast.templateId} not found`,
    );
    await maybeMarkBroadcastCompleted(broadcastRef);
    return NextResponse.json({ ok: true, status: "failed" });
  }
  const template = templateSnap.data() as MessageTemplateDoc;
  const subAccount = subAccountSnap.exists
    ? (subAccountSnap.data() as SubAccountDoc)
    : null;
  const agency = agencySnap.exists ? (agencySnap.data() as AgencyDoc) : null;

  // Owner snapshot for merge tags (matches the automation executor pattern).
  let ownerDisplayName = "";
  let ownerEmail = "";
  if (agency?.ownerUid) {
    try {
      const ownerSnap = await db.collection("users").doc(agency.ownerUid).get();
      const data = ownerSnap.data();
      ownerDisplayName = (data?.displayName as string) ?? "";
      ownerEmail = (data?.email as string) ?? "";
    } catch {
      // Empty strings tolerate cleanly in merge-tag resolution.
    }
  }

  const unsubscribeLink = buildUnsubscribeUrl(contact.id);
  const baseSubject = {
    contact: {
      name: contact.name,
      email: contact.email,
      phone: contact.phone,
    },
    owner: { displayName: ownerDisplayName, email: ownerEmail },
    workspace: { name: subAccount?.name ?? "" },
    bookingLink: subAccount?.bookingLink ?? "",
  } as const;

  const text = resolveMergeTags(template.body, {
    ...baseSubject,
    unsubscribeLink,
  });
  const subject = resolveMergeTags(template.subject ?? "", {
    ...baseSubject,
    unsubscribeLink,
  });

  // HTML body: identical render as the automation executor — anchor-tag the
  // unsubscribe link, convert newlines to <br>, wrap in a minimal styled
  // shell. v1 doesn't escape author content because templates are
  // admin-authored, not user input.
  const htmlAnchor = unsubscribeLink
    ? `<a href="${unsubscribeLink}">Unsubscribe</a>`
    : "";
  const htmlInner = resolveMergeTags(template.body, {
    ...baseSubject,
    unsubscribeLink: htmlAnchor,
  }).replace(/\r?\n/g, "<br>");
  const html = `<!doctype html><html><body style="font-family:system-ui,-apple-system,sans-serif;line-height:1.6;color:#1a1a1a;max-width:600px;margin:0 auto;padding:24px;">${htmlInner}</body></html>`;

  let resendMessageId: string | null = null;
  let error: string | null = null;
  try {
    const result = await sendEmail({
      to: contact.email,
      subject: subject || "(no subject)",
      text,
      html,
      replyTo: subAccount?.replyToEmail ?? undefined,
      from: tenantFrom(subAccount),
    });
    resendMessageId = result.id;
  } catch (err) {
    error = err instanceof Error ? err.message : "Send failed";
  }

  if (resendMessageId) {
    await sendRef.update({
      status: "sent",
      resendMessageId,
      sentAt: FieldValue.serverTimestamp(),
      attempts: FieldValue.increment(1),
    });
    await broadcastRef.update({
      "totals.sent": FieldValue.increment(1),
      "totals.queued": FieldValue.increment(-1),
      // Only flip queued → sending the first time a row settles. The
      // increment-from-0 check happens via maybeMarkBroadcastCompleted.
      ...(broadcast.status === "queued" ? { status: "sending", startedAt: FieldValue.serverTimestamp() } : {}),
    });
    // Activity row — same shape as a manual send so the timeline reads cleanly.
    await contactRef
      .collection("activities")
      .add({
        type: "email_sent",
        content: `Bulk email: ${broadcast.templateName}`,
        createdBy: "broadcast",
        meta: {
          broadcastId,
          messageId: resendMessageId,
          subject,
        },
        createdAt: FieldValue.serverTimestamp(),
      })
      .catch((err) =>
        console.warn("[broadcasts/step] activity write failed", err),
      );
  } else {
    await sendRef.update({
      status: "failed",
      error: error ?? "unknown",
      sentAt: Timestamp.now(),
      attempts: FieldValue.increment(1),
    });
    await broadcastRef.update({
      "totals.failed": FieldValue.increment(1),
      "totals.queued": FieldValue.increment(-1),
      ...(broadcast.status === "queued" ? { status: "sending", startedAt: FieldValue.serverTimestamp() } : {}),
    });
  }

  await maybeMarkBroadcastCompleted(broadcastRef);

  return NextResponse.json({ ok: true });
}

async function markSkipped(
  sendRef: FirebaseFirestore.DocumentReference,
  broadcastRef: FirebaseFirestore.DocumentReference,
  reason: "opt_out" | "no_email" | "contact_missing",
): Promise<void> {
  await sendRef.update({
    status: "skipped",
    skippedReason: reason,
    sentAt: FieldValue.serverTimestamp(),
    attempts: FieldValue.increment(1),
  });
  await broadcastRef.update({
    "totals.skipped": FieldValue.increment(1),
    "totals.queued": FieldValue.increment(-1),
  });
}

async function markFailed(
  sendRef: FirebaseFirestore.DocumentReference,
  broadcastRef: FirebaseFirestore.DocumentReference,
  errorMessage: string,
): Promise<void> {
  await sendRef.update({
    status: "failed",
    error: errorMessage,
    sentAt: FieldValue.serverTimestamp(),
    attempts: FieldValue.increment(1),
  });
  await broadcastRef.update({
    "totals.failed": FieldValue.increment(1),
    "totals.queued": FieldValue.increment(-1),
  });
}

/**
 * If totals.queued is now 0, flip status → "completed" and stamp
 * completedAt. Re-reads the doc so the increment that just happened is
 * reflected; uses a transaction so the flip can't fire twice if two final
 * rows settle at exactly the same time.
 */
async function maybeMarkBroadcastCompleted(
  broadcastRef: FirebaseFirestore.DocumentReference,
): Promise<void> {
  await getAdminDb().runTransaction(async (tx) => {
    const snap = await tx.get(broadcastRef);
    if (!snap.exists) return;
    const data = snap.data() as BroadcastDoc;
    if (data.status === "completed" || data.status === "failed") return;
    if ((data.totals?.queued ?? 0) <= 0) {
      tx.update(broadcastRef, {
        status: "completed",
        completedAt: FieldValue.serverTimestamp(),
      });
    }
  });
}
