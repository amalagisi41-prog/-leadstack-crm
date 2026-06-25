import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import {
  invalidateSubAccountTwilioCache,
  subAccountTwilioIsConfigured,
} from "@/lib/comms/twilio";
import { autoConfigureInboundWebhook } from "@/lib/comms/twilio-config";
import type { SubAccountDoc } from "@/types";

/**
 * Manage the per-sub-account WhatsApp sender. WhatsApp reuses the same Twilio
 * credentials (accountSid + authToken) the sub-account already saved for SMS,
 * so this route only manages the WhatsApp *sender number* + sandbox flag — it
 * does NOT take credentials. The dedicated SMS Twilio config must already be
 * enabled (creds present) before a WhatsApp sender can be set.
 *
 * POST — set the WhatsApp sender. Body: { whatsappFromNumber, sandbox? }
 *   1. requireSubAccountAdmin
 *   2. require an existing enabled twilioConfig (the creds are reused)
 *   3. best-effort auto-config the inbound webhook on the sender's number
 *      (skipped in sandbox — Twilio's shared sandbox webhook is set in the
 *      console, so we surface the URL for manual config instead)
 *   4. persist whatsappFromNumber / whatsappSandbox via dot-notation merge so
 *      the SMS fields on twilioConfig are untouched.
 *
 * DELETE — clear the WhatsApp sender (whatsappFromNumber → null). Twilio creds
 *   + SMS config are left intact.
 */

interface PostBody {
  whatsappFromNumber?: string;
  sandbox?: boolean;
}

/** Twilio's shared WhatsApp Sandbox sender number. */
const SANDBOX_NUMBER = "+14155238886";

function whatsappWebhookUrl(): string {
  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "";
  return base ? `${base}/api/webhooks/twilio/whatsapp/inbound` : "";
}

function normalisePhone(s: string): string {
  let cleaned = s.trim().replace(/[\s\-()]/g, "");
  if (cleaned.startsWith("00")) cleaned = "+" + cleaned.slice(2);
  return cleaned;
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;

  let body: PostBody;
  try {
    body = (await request.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const sandbox = body.sandbox === true;
  const raw = body.whatsappFromNumber?.trim() ?? "";
  const whatsappFromNumber = sandbox
    ? SANDBOX_NUMBER
    : raw
      ? normalisePhone(raw)
      : "";

  if (!whatsappFromNumber) {
    return NextResponse.json(
      { error: "whatsappFromNumber is required (or set sandbox: true)." },
      { status: 400 },
    );
  }
  if (!whatsappFromNumber.startsWith("+")) {
    return NextResponse.json(
      { error: "whatsappFromNumber must be E.164 (e.g. +15551234567)." },
      { status: 400 },
    );
  }

  // WhatsApp reuses the SMS Twilio creds — they must already be configured.
  const snap = await getAdminDb().doc(`subAccounts/${subAccountId}`).get();
  const cfg = (snap.data() as SubAccountDoc | undefined)?.twilioConfig ?? null;
  if (!subAccountTwilioIsConfigured(cfg) || !cfg) {
    return NextResponse.json(
      {
        error:
          "Configure your dedicated Twilio number (Settings → SMS) first — WhatsApp reuses those credentials.",
      },
      { status: 400 },
    );
  }

  // Best-effort auto-config the inbound webhook for the sender's number.
  // Skipped for sandbox: the shared sandbox number isn't owned by the
  // operator's account, so the IncomingPhoneNumbers PATCH won't find it —
  // sandbox inbound is configured in the Twilio console instead.
  const webhookUrl = whatsappWebhookUrl();
  let webhookResult = { ok: false, error: null as string | null };
  if (sandbox) {
    webhookResult.error =
      "Sandbox inbound is configured in the Twilio console (Messaging → Try it out → WhatsApp sandbox settings).";
  } else if (!webhookUrl) {
    webhookResult.error =
      "NEXT_PUBLIC_APP_URL is not set on this deployment — set the inbound webhook URL manually in Twilio.";
  } else {
    webhookResult = await autoConfigureInboundWebhook({
      accountSid: cfg.accountSid,
      authToken: cfg.authToken,
      fromNumber: whatsappFromNumber,
      webhookUrl,
    });
  }

  // Use update() (not set+merge) so the dot-notation keys are treated as
  // nested FIELD PATHS. With set({merge:true}) a key like
  // "twilioConfig.whatsappFromNumber" is taken literally — it creates a
  // bogus top-level field with a dot in its name instead of writing the
  // nested twilioConfig.whatsappFromNumber the UI + inbound webhook read.
  // The sub-account doc always exists here (the SMS creds were saved first).
  await getAdminDb()
    .doc(`subAccounts/${subAccountId}`)
    .update({
      "twilioConfig.whatsappFromNumber": whatsappFromNumber,
      "twilioConfig.whatsappSandbox": sandbox,
      "twilioConfig.whatsappInboundWebhookConfigured": webhookResult.ok,
      updatedAt: FieldValue.serverTimestamp(),
    });

  invalidateSubAccountTwilioCache(subAccountId);

  return NextResponse.json({
    ok: true,
    whatsappFromNumber,
    sandbox,
    inboundWebhookConfigured: webhookResult.ok,
    inboundWebhookUrl: webhookUrl,
    inboundWebhookError: webhookResult.error,
  });
}

export async function DELETE(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;

  await getAdminDb()
    .doc(`subAccounts/${subAccountId}`)
    .update({
      "twilioConfig.whatsappFromNumber": null,
      "twilioConfig.whatsappSandbox": false,
      "twilioConfig.whatsappInboundWebhookConfigured": false,
      updatedAt: FieldValue.serverTimestamp(),
    });

  invalidateSubAccountTwilioCache(subAccountId);
  return NextResponse.json({ ok: true });
}
