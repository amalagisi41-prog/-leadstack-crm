import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { getChannelConfig } from "@/lib/comms/ai/agent";
import { checkAndCount } from "@/lib/comms/web-chat/rate-limit";
import {
  appendMessage,
  isValidSessionId,
  markCaptureSkipped,
} from "@/lib/comms/web-chat/session";
import { reconcileContactFromCapture } from "@/lib/comms/web-chat/capture";
import { createFollowUpActions } from "@/lib/comms/web-chat/follow-up";
import { emitWebhookEvent } from "@/lib/api/webhooks/dispatch";
import { ipFromRequest } from "@/lib/contacts/location";
import type { SubAccountDoc } from "@/types";

export const dynamic = "force-dynamic";

/**
 * Inline-form submission endpoint. Called by the widget when the visitor
 * fills + submits (or skips) the form rendered in response to a
 * [[form fields="…"]] marker. Two modes:
 *
 *   - Submit: validate fields, create/reconcile Contact, link the
 *     session, write a synthetic visitor + bot turn into the thread so
 *     the conversation history reflects what happened.
 *
 *   - Skip: stamp captureSkipped=true on the session so the bot stops
 *     asking. No Contact created.
 *
 * Like /message: no origin gate (iframe is on LeadStack's domain), so
 * gated by channel-enabled + rate limits + sessionId validity.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?[0-9][\d\s\-().]{5,}$/;

function corsHeaders(origin: string | null): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin ?? "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export async function OPTIONS(request: Request) {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(request.headers.get("origin")),
  });
}

export async function POST(request: Request) {
  const headers = corsHeaders(request.headers.get("origin"));

  let body: {
    sa?: string;
    sessionId?: string;
    skip?: boolean;
    name?: string;
    email?: string;
    phone?: string;
    pageUrl?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON" },
      { status: 400, headers },
    );
  }

  const subAccountId = body.sa?.trim();
  const sessionId = body.sessionId?.trim();
  if (!subAccountId) {
    return NextResponse.json({ error: "Missing sa" }, { status: 400, headers });
  }
  if (!isValidSessionId(sessionId)) {
    return NextResponse.json(
      { error: "Invalid sessionId" },
      { status: 400, headers },
    );
  }

  const config = await getChannelConfig(subAccountId, "web-chat");
  if (!config || !config.enabled) {
    return NextResponse.json(
      { error: "Web Chat is not enabled for this sub-account" },
      { status: 403, headers },
    );
  }

  // Rate-limit shares the same buckets as /message — a malicious actor
  // can't pivot from one endpoint to the other to bypass caps.
  const ip = ipFromRequest(request) ?? "unknown";
  const rl = checkAndCount(ip, sessionId);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many requests" },
      {
        status: 429,
        headers: { ...headers, "Retry-After": String(rl.retryAfterSec) },
      },
    );
  }

  const db = getAdminDb();
  const sessionRef = db.doc(
    `subAccounts/${subAccountId}/webChatSessions/${sessionId}`,
  );
  const sessionSnap = await sessionRef.get();
  if (!sessionSnap.exists) {
    return NextResponse.json(
      { error: "Session not found" },
      { status: 404, headers },
    );
  }
  const session = sessionSnap.data() as {
    contactId: string | null;
    agencyId: string;
  };

  // ----- Skip branch -----
  if (body.skip) {
    await markCaptureSkipped({ subAccountId, sessionId });
    const skipReply =
      "No problem — let me know if there's anything else you'd like to ask.";
    await appendMessage({
      subAccountId,
      agencyId: session.agencyId,
      sessionId,
      direction: "outbound",
      body: skipReply,
      tokens: 0,
      aiGenerated: false,
    });
    return NextResponse.json(
      { ok: true, reply: skipReply },
      { status: 200, headers },
    );
  }

  // ----- Submit branch — validate fields -----
  const name = (body.name ?? "").trim().slice(0, 200) || null;
  const emailRaw = (body.email ?? "").trim();
  const phoneRaw = (body.phone ?? "").trim();
  const email = emailRaw && EMAIL_RE.test(emailRaw) ? emailRaw : null;
  const phone = phoneRaw && PHONE_RE.test(phoneRaw) ? phoneRaw : null;

  if (emailRaw && !email) {
    return NextResponse.json(
      { error: "That email doesn't look right — please check and try again." },
      { status: 400, headers },
    );
  }
  if (phoneRaw && !phone) {
    return NextResponse.json(
      { error: "That phone number doesn't look right — please check and try again." },
      { status: 400, headers },
    );
  }
  if (!email && !phone) {
    return NextResponse.json(
      { error: "Please enter at least an email or a phone number." },
      { status: 400, headers },
    );
  }

  // Need agencyId tenancy stamp on the contact create.
  const saSnap = await db.doc(`subAccounts/${subAccountId}`).get();
  if (!saSnap.exists) {
    return NextResponse.json(
      { error: "Sub-account not found" },
      { status: 404, headers },
    );
  }
  const sa = saSnap.data() as SubAccountDoc;

  // Echo the visitor's submission into the thread as an inbound row so
  // the conversation history reads naturally. Not strictly required —
  // helps both the operator console and any future "resume thread"
  // feature see what was shared.
  const submittedSummary = [
    name ? `name: ${name}` : null,
    email ? `email: ${email}` : null,
    phone ? `phone: ${phone}` : null,
  ]
    .filter(Boolean)
    .join(", ");
  await appendMessage({
    subAccountId,
    agencyId: session.agencyId,
    sessionId,
    direction: "inbound",
    body: `(submitted via form) ${submittedSummary}`,
    tokens: null,
    aiGenerated: false,
  });

  // Reconcile contact (email-match wins, otherwise create).
  let contactId: string | null = null;
  try {
    const reconciled = await reconcileContactFromCapture({
      agencyId: sa.agencyId,
      subAccountId,
      sessionId,
      existingContactId: session.contactId,
      pageUrl: body.pageUrl?.slice(0, 500) ?? null,
      capture: { name, email, phone },
    });
    contactId = reconciled?.contactId ?? null;
  } catch (err) {
    console.error(
      `[web-chat/capture] reconcile failed sa=${subAccountId}`,
      err,
    );
    return NextResponse.json(
      { error: "Couldn't save your details — please try again." },
      { status: 500, headers },
    );
  }

  // Post-capture follow-up: create a Task for the operator + notify the
  // escalation email. Best-effort — failures are logged + included in
  // the response but don't block the visitor's "thanks" reply.
  // Need the visitor's last inbound message for context in the email.
  let lastInboundMessage: string | null = null;
  try {
    const recentInbound = await sessionRef
      .collection("messages")
      .where("direction", "==", "inbound")
      .orderBy("createdAt", "desc")
      .limit(1)
      .get();
    if (!recentInbound.empty) {
      const data = recentInbound.docs[0].data() as { body?: string };
      // Skip the "(submitted via form)" row we just wrote above —
      // grab the actual visitor-typed message before the form.
      if (data.body && !data.body.startsWith("(submitted via form)")) {
        lastInboundMessage = data.body;
      } else {
        // Try the next one back.
        const beforeForm = await sessionRef
          .collection("messages")
          .where("direction", "==", "inbound")
          .orderBy("createdAt", "desc")
          .limit(5)
          .get();
        for (const d of beforeForm.docs) {
          const b = (d.data() as { body?: string }).body;
          if (b && !b.startsWith("(submitted via form)")) {
            lastInboundMessage = b;
            break;
          }
        }
      }
    }
  } catch {
    // Logged-only; the follow-up still runs without context.
  }

  const followUp = contactId
    ? await createFollowUpActions({
        agencyId: sa.agencyId,
        subAccountId,
        sessionId,
        contactId,
        capturedName: name,
        capturedEmail: email,
        capturedPhone: phone,
        lastInboundMessage,
        pageUrl: body.pageUrl?.slice(0, 500) ?? null,
      })
    : { taskId: null, emailSent: false, errors: ["no contact id"] };

  if (followUp.errors.length > 0) {
    console.warn(
      `[web-chat/capture] follow-up partial failure sa=${subAccountId}:`,
      followUp.errors.join("; "),
    );
  }

  // Stamp capture state + the linked task id on the session.
  await sessionRef.set(
    {
      capturePromptShownAt: FieldValue.serverTimestamp(),
      captureSkipped: false,
      pendingFollowUpTaskId: followUp.taskId,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  // Public-API webhook event so subscribers see captured web-chat leads
  // in real time. Fire-and-forget; webhook failures don't block the
  // visitor's thank-you reply.
  if (contactId) {
    void emitWebhookEvent({
      subAccountId,
      agencyId: sa.agencyId,
      mode: "live",
      type: "webchat.lead.captured",
      payload: {
        session: {
          id: sessionId,
          object: "webchat_session",
          page_url: body.pageUrl?.slice(0, 500) ?? null,
        },
        captured: { name, email, phone },
        contact_id: contactId,
        task_id: followUp.taskId,
      },
    });
  }

  // Templated thank-you so the next reply doesn't need an LLM round-trip.
  const who = name ? name : "you";
  const reach = email ?? phone ?? "the details you provided";
  const reply = `Thanks ${who}! Someone from the team will reach out via ${reach} shortly.`;
  await appendMessage({
    subAccountId,
    agencyId: session.agencyId,
    sessionId,
    direction: "outbound",
    body: reply,
    tokens: 0,
    aiGenerated: false,
  });

  return NextResponse.json(
    {
      ok: true,
      reply,
      contactId,
      taskId: followUp.taskId,
      emailSent: followUp.emailSent,
    },
    { status: 200, headers },
  );
}
