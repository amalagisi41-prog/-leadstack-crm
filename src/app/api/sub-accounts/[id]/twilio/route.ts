import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { invalidateSubAccountTwilioCache } from "@/lib/comms/twilio";
import {
  autoConfigureInboundWebhook,
  validateCredentials,
} from "@/lib/comms/twilio-config";
import type { TwilioConfig } from "@/types";

/**
 * Manage the per-sub-account Twilio config.
 *
 * POST  — create or update the dedicated config. Body:
 *   { accountSid, authToken, fromNumber }
 *
 *   Flow:
 *     1. requireSubAccountAdmin
 *     2. validateCredentials() — round-trip Twilio /Accounts/{sid}
 *     3. autoConfigureInboundWebhook() — best-effort PATCH the number's smsUrl.
 *        Failure here is reported in the response but doesn't block the save —
 *        the operator can configure the webhook URL manually from the settings
 *        page.
 *     4. Persist twilioConfig with enabled: true.
 *     5. Invalidate the in-memory client cache so subsequent sends pick up
 *        the new creds without a server restart.
 *
 * DELETE — turn off the dedicated config (sets enabled: false but keeps the
 *   creds on the doc, so toggling back on is a one-click affair). The
 *   inbound webhook on the Twilio side is left alone — gracefully degrades:
 *   if the operator re-enables, the webhook URL is still pointed at us.
 */

interface PostBody {
  accountSid?: string;
  authToken?: string;
  fromNumber?: string;
}

function inboundWebhookUrl(): string {
  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "";
  return `${base}/api/webhooks/twilio/inbound`;
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

  const accountSid = body.accountSid?.trim() ?? "";
  const fromNumberRaw = body.fromNumber?.trim() ?? "";
  const fromNumber = fromNumberRaw ? normalisePhone(fromNumberRaw) : "";

  // "Leave blank to keep" — the auth token is write-only (never sent back to
  // the browser), so an empty field on an existing config means "reuse the
  // token I saved before". Load the existing config and fall back to its
  // stored token when the operator left the field blank.
  const existingSnap = await getAdminDb()
    .doc(`subAccounts/${subAccountId}`)
    .get();
  const existingCfg =
    (existingSnap.data() as { twilioConfig?: TwilioConfig } | undefined)
      ?.twilioConfig ?? null;

  const submittedToken = body.authToken?.trim() ?? "";
  const authToken = submittedToken || existingCfg?.authToken || "";

  if (!accountSid || !fromNumber) {
    return NextResponse.json(
      { error: "accountSid and fromNumber are both required." },
      { status: 400 },
    );
  }
  if (!authToken) {
    return NextResponse.json(
      {
        error:
          "Auth token is required. Paste it from your Twilio console — there's no saved token to reuse yet.",
      },
      { status: 400 },
    );
  }
  if (!fromNumber.startsWith("+")) {
    return NextResponse.json(
      { error: "fromNumber must be E.164 (e.g. +15551234567)." },
      { status: 400 },
    );
  }
  if (!accountSid.startsWith("AC")) {
    return NextResponse.json(
      { error: "accountSid should start with AC (Twilio Account SID format)." },
      { status: 400 },
    );
  }

  // Step 1: validate the creds against Twilio.
  const validation = await validateCredentials(accountSid, authToken);
  if (!validation.ok) {
    return NextResponse.json(
      { error: `Twilio rejected the credentials: ${validation.error ?? "unknown"}` },
      { status: 400 },
    );
  }

  // Step 2: best-effort auto-config of the inbound webhook.
  const webhookUrl = inboundWebhookUrl();
  let webhookResult = { ok: false, error: null as string | null };
  if (webhookUrl) {
    webhookResult = await autoConfigureInboundWebhook({
      accountSid,
      authToken,
      fromNumber,
      webhookUrl,
    });
  } else {
    webhookResult.error =
      "NEXT_PUBLIC_APP_URL is not set on this deployment — webhook URL must be configured manually.";
  }

  // Step 3: persist.
  const cfg: TwilioConfig = {
    enabled: true,
    accountSid,
    authToken,
    fromNumber,
    inboundWebhookConfigured: webhookResult.ok,
    lastValidatedAt: new Date(),
    inboundWebhookSecret: null,
  };
  await getAdminDb()
    .doc(`subAccounts/${subAccountId}`)
    .set(
      {
        twilioConfig: cfg,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

  invalidateSubAccountTwilioCache(subAccountId);

  return NextResponse.json({
    ok: true,
    friendlyName: validation.friendlyName,
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

  // Disable the dedicated config but keep the creds on the doc — toggling
  // back on is a one-click affair from the settings UI. Use update() so the
  // dot-notation key is a nested field path; set({merge:true}) would take
  // "twilioConfig.enabled" literally and never flip the real nested field.
  await getAdminDb()
    .doc(`subAccounts/${subAccountId}`)
    .update({
      "twilioConfig.enabled": false,
      updatedAt: FieldValue.serverTimestamp(),
    });

  invalidateSubAccountTwilioCache(subAccountId);
  return NextResponse.json({ ok: true });
}
