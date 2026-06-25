import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { GLOBAL_TERRITORY_ID } from "@/types";
import type { SubAccountDoc } from "@/types";
import { resolveAgent, type ConfiguredChannelId } from "@/lib/comms/ai/agent";
import { emailIsConfigured, sendEmail, tenantFrom } from "@/lib/comms/resend";

/**
 * Channel-agnostic post-capture obligations. Web Chat and Voice both
 * call this after a Contact has been reconciled to:
 *
 *   1. Create a follow-up Task due end-of-today
 *   2. Send an escalation email to the agent's configured notify
 *      address (channel override wins, profile default fills the gap)
 *
 * Both steps are best-effort and never throw — failures land in the
 * returned `errors` array so the caller can surface a warning without
 * blocking the user-facing reply (web-chat thank-you, voice "we'll be
 * in touch").
 */

interface CreateCaptureFollowUpInput {
  agencyId: string;
  subAccountId: string;
  channelId: ConfiguredChannelId;
  /** Human-readable channel label used in Task title + email subject
   *  ("Web Chat", "Voice"). */
  channelLabel: string;
  /** The verb used in the Task title — "Follow up with" reads natural
   *  for Web Chat, "Call back" reads natural for Voice. */
  taskAction: "Follow up with" | "Call back";
  /** Word used in notes + email link label ("session" for Web Chat
   *  transcripts, "call" for voice). */
  sessionNoun: "session" | "call";
  /** Web Chat: sessionId. Voice: callId. Stored in Task notes so the
   *  operator can find the originating record. */
  sessionId: string;
  /** Optional deep-link path under the dashboard pointing at the
   *  session/call detail view. Voice can omit this in v1 (no transcript
   *  page yet) — the email then only deep-links to the contact. */
  sessionDeepLinkPath: string | null;
  contactId: string;
  capturedName: string | null;
  capturedEmail: string | null;
  capturedPhone: string | null;
  /** Snapshot of the most recent inbound utterance / summary. Web Chat
   *  passes the visitor's last typed message; Voice passes Vapi's
   *  end-of-call summary. Surfaced in the email body so the operator
   *  has context before opening the dashboard. */
  lastInboundMessage: string | null;
  /** Web Chat: visitor's page URL. Voice: null. */
  pageUrl: string | null;
}

export interface CaptureFollowUpResult {
  taskId: string | null;
  emailSent: boolean;
  errors: string[];
}

export async function createCaptureFollowUp(
  input: CreateCaptureFollowUpInput,
): Promise<CaptureFollowUpResult> {
  const errors: string[] = [];

  const identity =
    input.capturedName ||
    input.capturedEmail ||
    input.capturedPhone ||
    `Anonymous ${input.channelLabel.toLowerCase()} lead`;

  // ----- 1. Create the Task -----
  let taskId: string | null = null;
  try {
    const db = getAdminDb();
    const now = new Date();
    const dueAt = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      23,
      59,
      59,
    );

    const notes = [
      `Captured from ${input.channelLabel} ${input.sessionNoun}: ${input.sessionId}`,
      input.pageUrl ? `Page: ${input.pageUrl}` : null,
      input.capturedEmail ? `Email: ${input.capturedEmail}` : null,
      input.capturedPhone ? `Phone: ${input.capturedPhone}` : null,
      input.lastInboundMessage
        ? `\nLast ${input.sessionNoun === "call" ? "call summary" : "visitor message"}:\n"${input.lastInboundMessage}"`
        : null,
    ]
      .filter(Boolean)
      .join("\n");

    // Inherit territory from the captured contact (Global for a fresh
    // bot-captured lead; the real territory when reconciled to an
    // existing tagged contact).
    let territoryId: string = GLOBAL_TERRITORY_ID;
    try {
      const cSnap = await db.collection("contacts").doc(input.contactId).get();
      territoryId =
        (cSnap.data()?.territoryId as string | null | undefined) ??
        GLOBAL_TERRITORY_ID;
    } catch {
      territoryId = GLOBAL_TERRITORY_ID;
    }

    const taskRef = await db.collection("tasks").add({
      title: `${input.taskAction} ${identity} from ${input.channelLabel}`,
      notes,
      dueAt,
      completed: false,
      completedAt: null,
      contactId: input.contactId,
      dealId: null,
      eventId: null,
      agencyId: input.agencyId,
      subAccountId: input.subAccountId,
      createdByUid: `${input.channelId}-bot`,
      territoryId,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    taskId = taskRef.id;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error(
      `[ai/follow-up] task create failed sa=${input.subAccountId} channel=${input.channelId}`,
      err,
    );
    errors.push(`task: ${msg}`);
  }

  // ----- 2. Send the escalation email -----
  let emailSent = false;
  if (!emailIsConfigured()) {
    errors.push("email: not configured");
  } else {
    try {
      const db = getAdminDb();
      const [agent, subSnap] = await Promise.all([
        resolveAgent(input.subAccountId, input.channelId),
        db.doc(`subAccounts/${input.subAccountId}`).get(),
      ]);
      const subAccount = subSnap.data() as SubAccountDoc | undefined;
      const to = agent?.effective.escalationNotifyEmail?.trim();
      if (!to) {
        errors.push("email: no escalation address configured");
      } else {
        const appUrl =
          process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://leadstack.dev";
        const sessionUrl = input.sessionDeepLinkPath
          ? `${appUrl}${input.sessionDeepLinkPath}`
          : null;
        const contactUrl = `${appUrl}/sa/${input.subAccountId}/contacts/${input.contactId}`;

        const subject = `New ${input.channelLabel} lead: ${identity}`;
        const businessName =
          agent?.effective.businessName?.trim() || "your business";

        const html = renderCaptureEmail({
          channelLabel: input.channelLabel,
          sessionNoun: input.sessionNoun,
          businessName,
          identity,
          capturedName: input.capturedName,
          capturedEmail: input.capturedEmail,
          capturedPhone: input.capturedPhone,
          pageUrl: input.pageUrl,
          lastInboundMessage: input.lastInboundMessage,
          sessionUrl,
          contactUrl,
        });

        const text = [
          `New ${input.channelLabel} lead — ${identity}`,
          "",
          input.capturedName ? `Name: ${input.capturedName}` : null,
          input.capturedEmail ? `Email: ${input.capturedEmail}` : null,
          input.capturedPhone ? `Phone: ${input.capturedPhone}` : null,
          input.pageUrl ? `Page: ${input.pageUrl}` : null,
          input.lastInboundMessage
            ? `\nLatest ${input.sessionNoun === "call" ? "call summary" : "message"}:\n${input.lastInboundMessage}`
            : null,
          "",
          sessionUrl ? `${capitalize(input.sessionNoun)}: ${sessionUrl}` : null,
          `Contact: ${contactUrl}`,
          "",
          "A follow-up task has been created in your Tasks list, due today.",
        ]
          .filter((s): s is string => s !== null)
          .join("\n");

        await sendEmail({
          to,
          subject,
          text,
          html,
          from: tenantFrom(subAccount),
        });
        emailSent = true;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.error(
        `[ai/follow-up] email send failed sa=${input.subAccountId} channel=${input.channelId}`,
        err,
      );
      errors.push(`email: ${msg}`);
    }
  }

  return { taskId, emailSent, errors };
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}

function renderCaptureEmail(input: {
  channelLabel: string;
  sessionNoun: "session" | "call";
  businessName: string;
  identity: string;
  capturedName: string | null;
  capturedEmail: string | null;
  capturedPhone: string | null;
  pageUrl: string | null;
  lastInboundMessage: string | null;
  sessionUrl: string | null;
  contactUrl: string;
}): string {
  const detailsTable = [
    input.capturedName ? ["Name", esc(input.capturedName)] : null,
    input.capturedEmail
      ? [
          "Email",
          `<a href="mailto:${esc(input.capturedEmail)}">${esc(input.capturedEmail)}</a>`,
        ]
      : null,
    input.capturedPhone
      ? [
          "Phone",
          `<a href="tel:${esc(input.capturedPhone)}">${esc(input.capturedPhone)}</a>`,
        ]
      : null,
    input.pageUrl ? ["Page", `<a href="${esc(input.pageUrl)}">${esc(input.pageUrl)}</a>`] : null,
  ]
    .filter((r): r is [string, string] => r !== null)
    .map(
      ([k, v]) =>
        `<tr><td style="padding:4px 12px 4px 0;color:#64748b;font-size:13px;">${esc(k)}</td><td style="padding:4px 0;font-size:13px;">${v}</td></tr>`,
    )
    .join("");

  const lastMsgLabel =
    input.sessionNoun === "call" ? "Call summary" : "Latest message";
  const lastMsgBlock = input.lastInboundMessage
    ? `<div style="margin-top:20px;padding:12px 14px;background:#f8fafc;border-left:3px solid #7c3aed;border-radius:4px;">
         <div style="font-size:11px;text-transform:uppercase;color:#64748b;letter-spacing:0.05em;margin-bottom:6px;">${esc(lastMsgLabel)}</div>
         <div style="font-size:14px;color:#0f172a;white-space:pre-wrap;">${esc(input.lastInboundMessage)}</div>
       </div>`
    : "";

  const sessionButton = input.sessionUrl
    ? `<a href="${esc(input.sessionUrl)}" style="display:inline-block;background:#7c3aed;color:white;text-decoration:none;padding:10px 16px;border-radius:8px;font-size:13px;font-weight:600;">Open ${esc(input.channelLabel.toLowerCase())} ${esc(input.sessionNoun)}</a>`
    : "";

  return `<!doctype html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f1f5f9;margin:0;padding:24px;">
  <div style="max-width:560px;margin:0 auto;background:white;border-radius:12px;padding:28px;">
    <div style="font-size:11px;text-transform:uppercase;color:#7c3aed;letter-spacing:0.08em;font-weight:600;">New ${esc(input.channelLabel)} lead</div>
    <h1 style="margin:8px 0 4px;font-size:20px;color:#0f172a;">${esc(input.identity)} just reached out</h1>
    <p style="margin:0 0 20px;color:#64748b;font-size:14px;">A ${esc(input.sessionNoun === "call" ? "caller" : "visitor")} on ${esc(input.businessName)}'s ${esc(input.sessionNoun === "call" ? "phone line" : "site")} shared their contact details via the AI ${esc(input.channelLabel.toLowerCase())} agent.</p>
    <table style="border-collapse:collapse;width:100%;">${detailsTable}</table>
    ${lastMsgBlock}
    <div style="margin-top:24px;display:flex;gap:8px;">
      ${sessionButton}
      <a href="${esc(input.contactUrl)}" style="display:inline-block;background:transparent;color:#7c3aed;text-decoration:none;padding:10px 16px;border-radius:8px;font-size:13px;font-weight:600;border:1px solid #c4b5fd;">View contact</a>
    </div>
    <p style="margin:24px 0 0;color:#94a3b8;font-size:11px;">A follow-up task has been created in your Tasks list, due today.</p>
  </div>
</body></html>`;
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
