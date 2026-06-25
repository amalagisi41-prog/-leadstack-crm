import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import twilio from "twilio";
import { getAdminDb } from "@/lib/firebase/admin";
import { resolveAgent } from "@/lib/comms/ai/agent";
import { maybeRespondWithAi } from "@/lib/comms/ai/respond";
import { aiIsConfigured } from "@/lib/comms/ai/openrouter";
import { upsertConversationForMessage } from "@/lib/server/conversations-service";
import type { SubAccountDoc } from "@/types";
import type { Contact } from "@/types/contacts";

export const dynamic = "force-dynamic";

/**
 * Twilio inbound SMS webhook. One URL serves both modes:
 *
 *   - Shared mode (legacy): the inbound number matches the env var
 *     TWILIO_FROM_NUMBER. Signature is validated against TWILIO_AUTH_TOKEN.
 *     Behavior is the original v1 — STOP/START handling only, no message
 *     storage.
 *
 *   - Dedicated mode (opt-in): the inbound number matches a sub-account's
 *     `twilioConfig.fromNumber` AND that sub-account has
 *     `twilioConfig.enabled === true`. Signature is validated against that
 *     sub-account's authToken. STOP/START still flips `smsOptedOut` AND
 *     every inbound message gets persisted to
 *     `contacts/{contactId}/messages` so the chat thread renders.
 *
 * Resolution order: dedicated wins. If the same number is somehow
 * configured both as a sub-account dedicated number AND in the env var
 * (misconfiguration), the dedicated path runs because the lookup happens
 * first.
 *
 * Always returns 200 + empty TwiML so Twilio doesn't retry. Dropped
 * messages are logged but not reported back to Twilio.
 */

const STOP_WORDS = new Set([
  "STOP",
  "STOPALL",
  "UNSUBSCRIBE",
  "CANCEL",
  "END",
  "QUIT",
]);
const START_WORDS = new Set(["START", "UNSTOP", "YES"]);

function emptyTwimlResponse(): string {
  return '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';
}

function twimlResponse(body: string): NextResponse {
  return new NextResponse(body, {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  });
}

function normalisePhone(s: string): string {
  let cleaned = s.trim().replace(/[\s\-()]/g, "");
  if (cleaned.startsWith("00")) cleaned = "+" + cleaned.slice(2);
  return cleaned;
}

interface ResolvedRoute {
  mode: "shared" | "dedicated";
  authToken: string;
  /** Only populated for dedicated mode. Scopes contact lookups to this sub-account. */
  subAccountId: string | null;
  agencyId: string | null;
}

/**
 * Decide which mode this inbound belongs to, based on the To number.
 * Returns null when the number doesn't match any configured destination —
 * caller drops with 200 empty TwiML.
 */
async function resolveRoute(
  toNumber: string,
): Promise<ResolvedRoute | null> {
  if (!toNumber) return null;
  const normalisedTo = normalisePhone(toNumber);

  // Dedicated lookup first.
  const dedicated = await getAdminDb()
    .collection("subAccounts")
    .where("twilioConfig.fromNumber", "==", normalisedTo)
    .where("twilioConfig.enabled", "==", true)
    .limit(1)
    .get();
  if (!dedicated.empty) {
    const sa = dedicated.docs[0].data() as SubAccountDoc;
    if (sa.twilioConfig?.authToken) {
      return {
        mode: "dedicated",
        authToken: sa.twilioConfig.authToken,
        subAccountId: dedicated.docs[0].id,
        agencyId: sa.agencyId,
      };
    }
  }

  // Shared fallback — env var match.
  const envFrom = process.env.TWILIO_FROM_NUMBER
    ? normalisePhone(process.env.TWILIO_FROM_NUMBER)
    : null;
  const envToken = process.env.TWILIO_AUTH_TOKEN ?? null;
  if (envFrom && envToken && envFrom === normalisedTo) {
    return {
      mode: "shared",
      authToken: envToken,
      subAccountId: null,
      agencyId: null,
    };
  }

  return null;
}

export async function POST(request: Request) {
  // Twilio sends application/x-www-form-urlencoded. Parse first so we can
  // route by To number before validating the signature.
  const rawBody = await request.text();
  const params = Object.fromEntries(
    new URLSearchParams(rawBody).entries(),
  );

  const fromRaw = (params["From"] as string | undefined) ?? "";
  const toRaw = (params["To"] as string | undefined) ?? "";
  const bodyRaw = (params["Body"] as string | undefined) ?? "";
  const messageSid = (params["MessageSid"] as string | undefined) ?? "";
  const from = normalisePhone(fromRaw);
  const to = normalisePhone(toRaw);

  const route = await resolveRoute(to);
  if (!route) {
    console.warn(
      `[twilio/inbound] inbound to ${to || "(missing)"} matched no configured number — dropping`,
    );
    return twimlResponse(emptyTwimlResponse());
  }

  const signature = request.headers.get("x-twilio-signature");
  if (!signature) {
    console.warn("[twilio/inbound] missing X-Twilio-Signature header");
    return twimlResponse(emptyTwimlResponse());
  }

  // Validate signature against the resolved auth token.
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  const host =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const url = new URL(request.url);
  const fullUrl = `${proto}://${host ?? url.host}${url.pathname}`;
  const valid = twilio.validateRequest(
    route.authToken,
    signature,
    fullUrl,
    params,
  );
  if (!valid) {
    console.warn(
      `[twilio/inbound] invalid signature (mode=${route.mode}, sa=${route.subAccountId ?? "n/a"})`,
    );
    return new NextResponse("Invalid signature", { status: 403 });
  }

  if (!from) {
    return twimlResponse(emptyTwimlResponse());
  }

  // Detect opt-out / opt-in keywords (first whitespace-delimited word, upper-cased).
  const word = bodyRaw.trim().toUpperCase().split(/\s+/)[0] ?? "";
  let nextOptedOut: boolean | null = null;
  if (STOP_WORDS.has(word)) nextOptedOut = true;
  else if (START_WORDS.has(word)) nextOptedOut = false;

  // Match contacts.
  // Shared mode: existing behavior — across all contacts (legacy).
  // Dedicated mode: scope to this sub-account so cross-tenant phones don't leak.
  const db = getAdminDb();
  let query = db
    .collection("contacts")
    .where("phone", "==", from) as FirebaseFirestore.Query;
  if (route.mode === "dedicated" && route.subAccountId) {
    query = query.where("subAccountId", "==", route.subAccountId);
  }
  const matches = await query.limit(5).get();

  // ----- Dedicated-mode message-row write (BEFORE opt-out so the row
  // captures the actual word the customer sent, even if it's STOP/START) -----
  if (route.mode === "dedicated" && !matches.empty && route.subAccountId) {
    const docId = messageSid || db.collection("contacts").doc().id;
    const writes = matches.docs.map((d) => {
      const ref = d.ref.collection("messages").doc(docId);
      return ref.set(
        {
          agencyId: route.agencyId,
          subAccountId: route.subAccountId,
          contactId: d.id,
          direction: "inbound",
          status: "received",
          body: bodyRaw,
          from,
          to,
          twilioMessageSid: messageSid || null,
          sentByUid: null,
          error: null,
          readAt: null,
          createdAt: FieldValue.serverTimestamp(),
        },
        { merge: true }, // Twilio retries on the same MessageSid → idempotent
      );
    });
    try {
      await Promise.all(writes);
    } catch (err) {
      console.warn("[twilio/inbound] message-row write failed", err);
    }

    // Unified-inbox index — one conversation per matched contact.
    await Promise.all(
      matches.docs.map((d) => {
        const cdata = d.data() as { name?: string; phone?: string };
        return upsertConversationForMessage({
          contactId: d.id,
          subAccountId: route.subAccountId!,
          agencyId: route.agencyId ?? "",
          contactName: cdata.name ?? "",
          contactPhone: cdata.phone ?? from,
          channel: "sms",
          direction: "inbound",
          body: bodyRaw,
        });
      }),
    );
  } else if (route.mode === "dedicated" && matches.empty) {
    console.warn(
      `[twilio/inbound] dedicated inbound from ${from} → ${to} (sa=${route.subAccountId}): no contact match — dropping per locked policy`,
    );
  }

  // ----- Opt-out / opt-in handling (both modes, existing behavior) -----
  if (nextOptedOut === null) {
    // Not a STOP/START word. In dedicated mode the message row above was
    // already written. In shared mode there's nothing more to persist.
    //
    // Dedicated-mode-only: route to AI auto-reply if configured + enabled.
    // The AI lives in dedicated mode because it needs the sub-account's
    // own Twilio number to reply from and its own persona prompt. Shared
    // mode is opt-out-only by design.
    if (
      route.mode === "dedicated" &&
      route.subAccountId &&
      !matches.empty &&
      aiIsConfigured()
    ) {
      try {
        const agent = await resolveAgent(route.subAccountId, "sms");
        if (agent?.effective.enabled) {
          // Respond to the first matched contact only. If multiple
          // contacts share the same phone in this sub-account (data
          // hygiene issue), we don't want to fire N identical SMS
          // replies to the same number.
          const contactDoc = matches.docs[0];
          const contact = {
            id: contactDoc.id,
            ...(contactDoc.data() as Omit<Contact, "id">),
          };
          const saSnap = await db
            .doc(`subAccounts/${route.subAccountId}`)
            .get();
          const subAccount = saSnap.data() as SubAccountDoc | undefined;
          if (subAccount) {
            // Fire-and-await: bounded latency is fine here because we're
            // already inside the webhook response. Twilio gives us ~15s
            // before it times out — Haiku replies in 1-3s typically.
            await maybeRespondWithAi({
              subAccountId: route.subAccountId,
              subAccount,
              agent,
              channelId: "sms",
              contact,
              incomingMessage: bodyRaw,
              contactPhone: from,
            });
          }
        }
      } catch (err) {
        // Never let an AI failure break the webhook contract. Stripe-style:
        // log and move on, return 200 so Twilio doesn't retry.
        console.error(
          `[twilio/inbound] AI reply pipeline failed for sa=${route.subAccountId}`,
          err,
        );
      }
    }

    return twimlResponse(emptyTwimlResponse());
  }

  if (matches.empty) {
    console.warn(
      `[twilio/inbound] ${word} from ${from} (mode=${route.mode}) — no matching contact`,
    );
    return twimlResponse(emptyTwimlResponse());
  }

  const batch = db.batch();
  for (const docSnap of matches.docs) {
    batch.update(docSnap.ref, {
      smsOptedOut: nextOptedOut,
      updatedAt: FieldValue.serverTimestamp(),
    });
    batch.set(docSnap.ref.collection("activities").doc(), {
      type: "automation_step_skipped",
      content: nextOptedOut
        ? `SMS opt-out (${word}) received from ${from}.`
        : `SMS opt-in (${word}) received from ${from}.`,
      createdBy: "twilio_inbound",
      meta: { kind: "sms_opt_out", word, optedOut: nextOptedOut, mode: route.mode },
      createdAt: FieldValue.serverTimestamp(),
    });
  }
  await batch.commit();

  return twimlResponse(emptyTwimlResponse());
}
