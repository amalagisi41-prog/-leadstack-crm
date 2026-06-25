import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import type { Firestore } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import {
  sendSmsForSubAccount,
  sendWhatsappForSubAccount,
  smsIsConfigured,
  subAccountTwilioIsConfigured,
  subAccountWhatsappIsConfigured,
  sendWhatsappTemplateForSubAccount,
} from "@/lib/comms/twilio";
import { resolveTemplateVariables } from "@/lib/comms/whatsapp/resolve-template-variables";
import { upsertConversationForMessage } from "@/lib/server/conversations-service";
import {
  DEFAULT_REVIEW_COOLDOWN_DAYS,
  DEFAULT_REVIEW_SMS_TEMPLATE,
  normalizeReviewChannel,
} from "@/lib/reviews/constants";
import type { MergeTagSubject } from "@/lib/automations/merge-tags";
import type { AgencyDoc, SubAccountDoc } from "@/types";
import type { Contact } from "@/types/contacts";
import type { ConversationChannel } from "@/types/conversations";
import type { WhatsappTemplateDoc } from "@/types/whatsapp-templates";

/**
 * Google review-request dispatcher. Sends a "leave us a review" message over
 * SMS or WhatsApp to a contact, then logs it on the timeline + conversation.
 *
 * Reuses the same send + persist paths as the manual comms routes (message row
 * + unified-inbox upsert), so a review request shows up in the contact thread
 * and the inbox like any other outbound. Best-effort: returns a reason instead
 * of throwing, so the quote-paid hook can `void` it safely.
 *
 * SMS is free-form. WhatsApp is business-initiated outside the 24h window → it
 * MUST use an approved template (review URL baked into the approved body), sent
 * via Twilio's contentSid path. The settings save route + this dispatcher both
 * enforce that, so a non-compliant WhatsApp send is impossible.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export type ReviewTrigger = "manual" | "quote_paid" | "deal_completed";

export interface SendReviewInput {
  subAccountId: string;
  agencyId: string;
  contactId: string;
  trigger: ReviewTrigger;
}

export interface SendReviewResult {
  sent: boolean;
  /** When sent is false: not_configured | trigger_disabled | no_contact |
   *  no_phone | opted_out | cooldown | sms_not_configured | whatsapp_gate_off |
   *  whatsapp_not_configured | no_template | template_not_approved |
   *  template_var_missing | send_failed | error */
  reason?: string;
}

function firstWord(s: string): string {
  const t = (s ?? "").trim();
  const i = t.indexOf(" ");
  return i === -1 ? t : t.slice(0, i);
}

function fillReviewSms(
  template: string,
  v: { firstName: string; businessName: string; reviewUrl: string },
): string {
  return template
    .replace(/\{\{\s*firstName\s*\}\}/g, v.firstName)
    .replace(/\{\{\s*businessName\s*\}\}/g, v.businessName)
    .replace(/\{\{\s*reviewUrl\s*\}\}/g, v.reviewUrl);
}

function fillPositional(body: string, values: string[]): string {
  return body.replace(/\{\{\s*(\d+)\s*\}\}/g, (_m, n: string) => values[Number(n) - 1] ?? "");
}

function toMillis(v: unknown): number | null {
  const maybe = v as { toMillis?: () => number } | null | undefined;
  return maybe && typeof maybe.toMillis === "function" ? maybe.toMillis() : null;
}

export async function maybeSendReviewRequest(
  input: SendReviewInput,
): Promise<SendReviewResult> {
  try {
    const db = getAdminDb();
    const subSnap = await db.doc(`subAccounts/${input.subAccountId}`).get();
    const subAccount = subSnap.exists ? (subSnap.data() as SubAccountDoc) : null;
    const cfg = subAccount?.googleReviewConfig ?? null;
    if (!subAccount || !cfg || !cfg.reviewUrl) {
      return { sent: false, reason: "not_configured" };
    }

    const isManual = input.trigger === "manual";
    if (!isManual) {
      // Each auto trigger is gated by `enabled` + its own per-trigger flag.
      const triggerEnabled =
        input.trigger === "quote_paid"
          ? cfg.triggerOnQuotePaid === true
          : input.trigger === "deal_completed"
            ? cfg.triggerOnDealCompleted === true
            : false;
      if (!(cfg.enabled && triggerEnabled)) {
        return { sent: false, reason: "trigger_disabled" };
      }
    }

    const contactSnap = await db.doc(`contacts/${input.contactId}`).get();
    if (!contactSnap.exists) return { sent: false, reason: "no_contact" };
    const contact = {
      id: contactSnap.id,
      ...(contactSnap.data() as Omit<Contact, "id">),
    };
    if (!contact.phone) return { sent: false, reason: "no_phone" };

    const channel = normalizeReviewChannel(cfg.channel);
    const isWhatsapp = channel !== "sms";
    const convoChannel: ConversationChannel = isWhatsapp ? "whatsapp" : "sms";

    // Per-channel opt-out.
    if (channel === "sms" && contact.smsOptedOut) {
      return { sent: false, reason: "opted_out" };
    }
    if (isWhatsapp && contact.whatsappOptedOut) {
      return { sent: false, reason: "opted_out" };
    }

    // Cooldown — auto only; manual bypasses (operator intent) but still stamps.
    if (!isManual) {
      const cooldownDays =
        cfg.cooldownDays > 0 ? cfg.cooldownDays : DEFAULT_REVIEW_COOLDOWN_DAYS;
      const lastMs = toMillis(contact.reviewRequestedAt);
      if (lastMs && Date.now() - lastMs < cooldownDays * DAY_MS) {
        return { sent: false, reason: "cooldown" };
      }
    }

    const businessName = subAccount.name ?? "";

    // ---- Send (channel-specific) ----
    let sid: string;
    let fromNumber: string;
    let renderedBody: string;
    let writeRow = false;
    let messagesCollection = "messages";

    if (isWhatsapp) {
      messagesCollection = "whatsappMessages";
      // Both WhatsApp modes need the agency gate + a configured sender.
      if (subAccount.whatsappEnabledByAgency !== true) {
        return { sent: false, reason: "whatsapp_gate_off" };
      }
      if (!subAccountWhatsappIsConfigured(subAccount.twilioConfig)) {
        return { sent: false, reason: "whatsapp_not_configured" };
      }

      const freeFormBody = fillReviewSms(
        cfg.messageTemplate || DEFAULT_REVIEW_SMS_TEMPLATE,
        { firstName: firstWord(contact.name), businessName, reviewUrl: cfg.reviewUrl },
      );

      if (channel === "whatsapp_manual") {
        // Free-form — only valid while the 24h session window is open (the
        // customer messaged recently). No approved template required.
        const open = await whatsappWindowOpen(db, contact.id);
        if (!open) return { sent: false, reason: "window_closed" };
        const res = await sendWhatsappForSubAccount({
          subAccountId: input.subAccountId,
          subAccount,
          to: contact.phone,
          body: freeFormBody,
        });
        sid = res.sid;
        fromNumber = res.from;
        renderedBody = freeFormBody;
      } else {
        // whatsapp_template — approved template (compliant outside the window).
        if (!cfg.whatsappTemplateId) return { sent: false, reason: "no_template" };
        const tplSnap = await db
          .doc(`subAccounts/${input.subAccountId}/whatsappTemplates/${cfg.whatsappTemplateId}`)
          .get();
        const tpl = tplSnap.exists ? (tplSnap.data() as WhatsappTemplateDoc) : null;
        if (!tpl || tpl.status !== "approved" || !tpl.contentSid) {
          return { sent: false, reason: "template_not_approved" };
        }
        const subject = await buildSubject(db, contact, subAccount);
        const values = resolveTemplateVariables({
          variables: tpl.variables,
          subject,
          manualValues: {},
        });
        if (values.some((v) => v.trim() === "")) {
          return { sent: false, reason: "template_var_missing" };
        }
        const res = await sendWhatsappTemplateForSubAccount({
          subAccountId: input.subAccountId,
          subAccount,
          to: contact.phone,
          contentSid: tpl.contentSid,
          contentVariables: values,
        });
        sid = res.sid;
        fromNumber = res.from;
        renderedBody = fillPositional(tpl.body, values);
      }
      writeRow = true;
    } else {
      const dedicated = subAccountTwilioIsConfigured(subAccount.twilioConfig);
      if (!dedicated && !smsIsConfigured()) {
        return { sent: false, reason: "sms_not_configured" };
      }
      renderedBody = fillReviewSms(
        cfg.messageTemplate || DEFAULT_REVIEW_SMS_TEMPLATE,
        { firstName: firstWord(contact.name), businessName, reviewUrl: cfg.reviewUrl },
      );
      const res = await sendSmsForSubAccount({
        subAccountId: input.subAccountId,
        subAccount,
        to: contact.phone,
        body: renderedBody,
      });
      sid = res.sid;
      fromNumber = res.from;
      // Thread row only in dedicated mode (shared-sender writes no thread).
      writeRow = res.mode === "dedicated";
    }

    // ---- Persist (message row + inbox + stamp + activity) ----
    if (writeRow) {
      try {
        await db
          .collection("contacts")
          .doc(contact.id)
          .collection(messagesCollection)
          .doc(sid)
          .set({
            agencyId: input.agencyId,
            subAccountId: input.subAccountId,
            contactId: contact.id,
            direction: "outbound",
            status: "sent",
            body: renderedBody,
            from: fromNumber,
            to: contact.phone,
            twilioMessageSid: sid,
            sentByUid: "review-request",
            error: null,
            readAt: null,
            createdAt: FieldValue.serverTimestamp(),
          });
      } catch (err) {
        console.warn("[reviews/request] message-row write failed", err);
      }
      await upsertConversationForMessage({
        contactId: contact.id,
        subAccountId: input.subAccountId,
        agencyId: input.agencyId,
        contactName: contact.name ?? "",
        contactPhone: contact.phone,
        channel: convoChannel,
        direction: "outbound",
        body: renderedBody,
      });
    }

    // Cooldown stamp.
    try {
      await db.doc(`contacts/${contact.id}`).set(
        {
          reviewRequestedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    } catch (err) {
      console.warn("[reviews/request] stamp write failed", err);
    }

    // Activity row.
    try {
      await db
        .collection("contacts")
        .doc(contact.id)
        .collection("activities")
        .add({
          type: "review_requested",
          content: `Google review requested via ${isWhatsapp ? "WhatsApp" : "SMS"}.`,
          createdBy: "review-request",
          meta: { sid, channel, trigger: input.trigger },
          createdAt: FieldValue.serverTimestamp(),
        });
    } catch (err) {
      console.warn("[reviews/request] activity write failed", err);
    }

    return { sent: true };
  } catch (err) {
    console.warn("[reviews/request] failed", err);
    return { sent: false, reason: "send_failed" };
  }
}

/**
 * Is the WhatsApp 24h free-form window open for this contact? True when their
 * most recent message in the thread is an INBOUND within the window. Mirrors
 * the guard in /api/comms/whatsapp/send so manual free-form review sends only
 * go out when compliant.
 */
async function whatsappWindowOpen(
  db: Firestore,
  contactId: string,
  windowHours = 24,
): Promise<boolean> {
  try {
    const snap = await db
      .collection(`contacts/${contactId}/whatsappMessages`)
      .orderBy("createdAt", "desc")
      .limit(50)
      .get();
    for (const d of snap.docs) {
      const m = d.data() as {
        direction?: string;
        createdAt?: { toMillis?: () => number };
      };
      if (m.direction === "inbound") {
        const ms =
          m.createdAt && typeof m.createdAt.toMillis === "function"
            ? m.createdAt.toMillis()
            : null;
        return ms !== null && Date.now() - ms < windowHours * 60 * 60 * 1000;
      }
    }
    return false;
  } catch {
    return false;
  }
}

/** Build the merge-tag subject for WhatsApp template variable resolution. */
async function buildSubject(
  db: Firestore,
  contact: Contact,
  subAccount: SubAccountDoc,
): Promise<MergeTagSubject> {
  let owner = { displayName: "", email: "" };
  try {
    const agencySnap = await db.doc(`agencies/${contact.agencyId}`).get();
    const agency = agencySnap.exists ? (agencySnap.data() as AgencyDoc) : null;
    if (agency?.ownerUid) {
      const ownerSnap = await db.doc(`users/${agency.ownerUid}`).get();
      const od = ownerSnap.data();
      owner = {
        displayName: (od?.displayName as string) ?? "",
        email: (od?.email as string) ?? "",
      };
    }
  } catch {
    /* best-effort */
  }
  return {
    contact: {
      name: contact.name ?? "",
      email: contact.email ?? "",
      phone: contact.phone ?? "",
    },
    owner,
    workspace: { name: subAccount.name ?? "" },
    bookingLink: subAccount.bookingLink ?? "",
    unsubscribeLink: "",
  };
}
