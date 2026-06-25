import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { loadEffectiveTerritoryScope } from "@/lib/auth/territory-filter";
import { emailIsConfigured } from "@/lib/comms/resend";
import { publishCallback, qstashIsConfigured } from "@/lib/automations/qstash";
import { resolveMergeTags, validateEmailBody } from "@/lib/automations/merge-tags";
import { resolveAudience } from "@/lib/broadcasts/audience";
import type {
  BroadcastAudienceFilter,
  BroadcastDoc,
  BroadcastSendDoc,
  MessageTemplateDoc,
} from "@/types";

export const dynamic = "force-dynamic";

interface SendBody {
  subAccountId?: string;
  templateId?: string;
  audienceFilter?: BroadcastAudienceFilter;
}

/**
 * QStash fan-out throttle. We send at 5 messages/sec by default — well
 * under Resend's free-tier 10 req/sec API cap, leaving headroom for
 * concurrent one-off sends from the contact-profile UI. Each recipient gets
 * its own delayed QStash message; the batch fully drains in roughly
 * (audienceSize / SEND_RATE) seconds.
 *
 * 200ms × 50,000 = 10,000s ≈ 2h47m. Acceptable for an MVP — Resend's
 * Broadcasts API would beat us at scale, but per-contact merge-tag
 * rendering is the main reason we picked the fan-out route.
 */
const SEND_RATE_PER_SECOND = 5;
const DELAY_BETWEEN_SENDS_MS = 1000 / SEND_RATE_PER_SECOND;

/** Hard cap on per-broadcast audience size to prevent runaway sends. */
const MAX_AUDIENCE_SIZE = 25_000;

export async function POST(request: Request) {
  if (!emailIsConfigured()) {
    return NextResponse.json(
      { error: "Email is not configured on this deployment." },
      { status: 503 },
    );
  }
  if (!qstashIsConfigured()) {
    return NextResponse.json(
      { error: "QStash is not configured — bulk send needs the queue." },
      { status: 503 },
    );
  }

  let payload: SendBody;
  try {
    payload = (await request.json()) as SendBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const subAccountId = payload.subAccountId?.trim();
  const templateId = payload.templateId?.trim();
  const audienceFilter = payload.audienceFilter;

  if (!subAccountId || !templateId || !audienceFilter) {
    return NextResponse.json(
      { error: "subAccountId, templateId, and audienceFilter are required" },
      { status: 400 },
    );
  }
  if (
    audienceFilter.kind !== "all" &&
    audienceFilter.kind !== "tag" &&
    audienceFilter.kind !== "pipeline_stage"
  ) {
    return NextResponse.json(
      { error: "audienceFilter.kind must be 'all', 'tag', or 'pipeline_stage'" },
      { status: 400 },
    );
  }

  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const db = getAdminDb();

  // Agency-level gate. Sub-account admins can't bypass — the field is
  // server-set via the agency owner's Manage dialog. Default-deny on
  // missing field so legacy sub-accounts stay locked until the agency
  // owner explicitly enables broadcasts.
  const subSnap = await db.doc(`subAccounts/${subAccountId}`).get();
  if (!subSnap.exists) {
    return NextResponse.json(
      { error: "Sub-account not found" },
      { status: 404 },
    );
  }
  if (subSnap.data()?.broadcastsEnabledByAgency !== true) {
    return NextResponse.json(
      {
        error:
          "Broadcasts are disabled for this sub-account. Your agency administrator can enable them from Manage in the agency sub-accounts list.",
      },
      { status: 403 },
    );
  }

  // Validate template — must exist, must be email, must contain unsubscribeLink.
  const templateSnap = await db
    .collection("message_templates")
    .doc(templateId)
    .get();
  if (!templateSnap.exists) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }
  const template = templateSnap.data() as MessageTemplateDoc;
  if (template.subAccountId !== subAccountId) {
    return NextResponse.json(
      { error: "Template belongs to a different sub-account" },
      { status: 403 },
    );
  }
  if (template.type !== "email") {
    return NextResponse.json(
      { error: "Template is not an email template" },
      { status: 400 },
    );
  }
  const bodyValidation = validateEmailBody(template.body);
  if (bodyValidation) {
    return NextResponse.json({ error: bodyValidation }, { status: 400 });
  }

  // Resolve audience. A scoped collaborator only reaches contacts in
  // their assigned territories; admins / owners / scoping-off pass null.
  const scope = await loadEffectiveTerritoryScope(access);
  const audience = await resolveAudience(
    subAccountId,
    audienceFilter,
    scope.enforce ? (scope.ids ?? []) : null,
  );
  if (audience.recipients.length === 0) {
    return NextResponse.json(
      {
        error:
          "Audience is empty after pre-flight (no contacts match, or all are opted-out / missing email).",
        skipped: audience.skipped.length,
      },
      { status: 400 },
    );
  }
  if (audience.recipients.length > MAX_AUDIENCE_SIZE) {
    return NextResponse.json(
      {
        error: `Audience size ${audience.recipients.length} exceeds the per-broadcast cap of ${MAX_AUDIENCE_SIZE}. Narrow the filter and try again.`,
      },
      { status: 400 },
    );
  }

  // Snapshot the trigger user's display name for the broadcast doc.
  let createdByName = access.email;
  try {
    const u = await getAdminAuth().getUser(access.uid);
    createdByName = u.displayName || u.email || access.email;
  } catch {
    // Fall through with the email as the display name.
  }

  // Pre-render the subject for the broadcast list view. Uses an empty
  // contact context — merge tags in the subject still work for the per-send
  // pass; this is just a label.
  const subjectPreview = (template.subject ?? "")
    .slice(0, 200);

  const agencyId = templateSnap.data()?.agencyId as string;
  const broadcastRef = db.collection("broadcasts").doc();

  const broadcast: Omit<BroadcastDoc, "id"> = {
    agencyId,
    subAccountId,
    channel: "email",
    templateId,
    templateName: template.name,
    subjectPreview: resolveMergeTags(subjectPreview, {
      contact: { name: "", email: "", phone: "" },
      owner: { displayName: "", email: "" },
      workspace: { name: "" },
      bookingLink: "",
      unsubscribeLink: "",
    }),
    audienceFilter,
    status: "queued",
    totals: {
      audienceSize: audience.recipients.length + audience.skipped.length,
      queued: audience.recipients.length,
      sent: 0,
      skipped: audience.skipped.length,
      failed: 0,
    },
    createdByUid: access.uid,
    createdBy: { displayName: createdByName, email: access.email },
    createdAt: FieldValue.serverTimestamp() as unknown as null,
    startedAt: null,
    completedAt: null,
    errorMessage: null,
  };
  await broadcastRef.set({ id: broadcastRef.id, ...broadcast });

  // Write the per-send rows for recipients (in 500-doc batches — Firestore's
  // hard limit is 500 ops per batch).
  const sendsCol = broadcastRef.collection("sends");
  const recipientsToQueue = audience.recipients;
  for (let i = 0; i < recipientsToQueue.length; i += 500) {
    const slice = recipientsToQueue.slice(i, i + 500);
    const batch = db.batch();
    for (const contact of slice) {
      const sendRef = sendsCol.doc(contact.id);
      const sendDoc: Omit<BroadcastSendDoc, "id"> = {
        broadcastId: broadcastRef.id,
        agencyId,
        subAccountId,
        contactId: contact.id,
        toEmail: contact.email,
        toName: contact.name,
        status: "queued",
        skippedReason: null,
        resendMessageId: null,
        error: null,
        attempts: 0,
        queuedAt: FieldValue.serverTimestamp() as unknown as null,
        sentAt: null,
      };
      batch.set(sendRef, { id: contact.id, ...sendDoc });
    }
    await batch.commit();
  }

  // Also write a row per skipped contact so the detail page shows them with
  // their reason. These are terminal — no QStash callback fires.
  const skippedToWrite = audience.skipped;
  for (let i = 0; i < skippedToWrite.length; i += 500) {
    const slice = skippedToWrite.slice(i, i + 500);
    const batch = db.batch();
    for (const { contact, reason } of slice) {
      const sendRef = sendsCol.doc(contact.id);
      const sendDoc: Omit<BroadcastSendDoc, "id"> = {
        broadcastId: broadcastRef.id,
        agencyId,
        subAccountId,
        contactId: contact.id,
        toEmail: contact.email,
        toName: contact.name,
        status: "skipped",
        skippedReason: reason,
        resendMessageId: null,
        error: null,
        attempts: 0,
        queuedAt: FieldValue.serverTimestamp() as unknown as null,
        sentAt: FieldValue.serverTimestamp() as unknown as null,
      };
      batch.set(sendRef, { id: contact.id, ...sendDoc });
    }
    await batch.commit();
  }

  // Fan out to QStash — one message per recipient, staggered to honor our
  // 5/sec rate. Each callback POSTs /api/broadcasts/email/step with the
  // broadcastId + contactId; the step route does the actual Resend call.
  let queuedCount = 0;
  let publishFailures = 0;
  for (let i = 0; i < recipientsToQueue.length; i++) {
    const contact = recipientsToQueue[i];
    const delayMs = i * DELAY_BETWEEN_SENDS_MS;
    const result = await publishCallback({
      pathname: "/api/broadcasts/email/step",
      body: { broadcastId: broadcastRef.id, contactId: contact.id },
      // QStash delay is in seconds — round up so two adjacent sends never
      // fire in the same second when the math floors to the same integer.
      delaySeconds: Math.ceil(delayMs / 1000),
      // Per-row dedup key — if the operator double-clicks Send and somehow
      // hits this route twice, the second batch's QStash publishes are
      // dropped at the QStash side rather than producing a duplicate send.
      deduplicationId: `bcast_${broadcastRef.id}_${contact.id}`,
    });
    if (result) {
      queuedCount += 1;
    } else {
      publishFailures += 1;
    }
  }

  // If every QStash publish failed (e.g. NEXT_PUBLIC_APP_URL misconfigured),
  // mark the broadcast failed so the UI shows the error rather than a
  // stuck-queued state. Partial-failures we tolerate: the row is queued in
  // Firestore and an operator can retry from the detail page in v2.
  if (queuedCount === 0 && publishFailures > 0) {
    await broadcastRef.update({
      status: "failed",
      errorMessage: "Every QStash publish failed. Check NEXT_PUBLIC_APP_URL.",
      completedAt: FieldValue.serverTimestamp(),
    });
    return NextResponse.json(
      { error: "Failed to schedule any sends. Check QStash configuration." },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    broadcastId: broadcastRef.id,
    queued: queuedCount,
    skipped: audience.skipped.length,
    publishFailures,
  });
}
