import { NextResponse } from "next/server";
import { parsePhoneNumberFromString } from "libphonenumber-js";

import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { getChannelConfig } from "@/lib/comms/ai/agent";
import { createOutboundCall, vapiIsConfigured } from "@/lib/comms/voice/vapi";
import type { SubAccountDoc } from "@/types";

export const dynamic = "force-dynamic";

type Body = { subAccountId?: string; phone?: string };

/**
 * Place a one-off TEST outbound call from the Outbound settings page, so
 * the operator can hear the saved opener + persona before running a real
 * campaign.
 *
 * Deliberately bypasses the compliance gate (no contact, no consent,
 * window, or caps — it's a test to a number the operator controls) and
 * leaves NO Firestore trace: the call is flagged `test` so the end-of-call
 * webhook short-circuits (no Contact / Task / summary doc).
 *
 * Uses the SAVED outbound config — the operator should save settings first
 * so the test reflects the latest opener + persona.
 */
export async function POST(request: Request) {
  let payload: Body;
  try {
    payload = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const subAccountId = payload.subAccountId?.trim();
  if (!subAccountId) {
    return NextResponse.json(
      { error: "subAccountId is required" },
      { status: 400 },
    );
  }

  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const parsed = payload.phone
    ? parsePhoneNumberFromString(payload.phone)
    : null;
  if (!parsed || !parsed.isValid()) {
    return NextResponse.json(
      { error: "Enter a valid phone number in international format (e.g. +1…)." },
      { status: 400 },
    );
  }
  const e164 = parsed.number;

  const db = getAdminDb();
  const subSnap = await db.doc(`subAccounts/${subAccountId}`).get();
  const subAccount = subSnap.exists ? (subSnap.data() as SubAccountDoc) : null;
  if (subAccount?.outboundVoiceEnabledByAgency !== true) {
    return NextResponse.json(
      { error: "Outbound calling is disabled for this workspace." },
      { status: 403 },
    );
  }

  if (!vapiIsConfigured()) {
    return NextResponse.json(
      { error: "Voice calling isn't configured on this deployment." },
      { status: 503 },
    );
  }

  const channel = await getChannelConfig(subAccountId, "voice");
  const voice = channel?.voice ?? null;
  if (!voice || voice.outboundEnabled !== true) {
    return NextResponse.json(
      { error: "Enable outbound calling and save first." },
      { status: 403 },
    );
  }
  if (!voice.vapiAssistantId || !voice.vapiPhoneNumberId) {
    return NextResponse.json(
      { error: "Enable the Voice channel first so the calling number is provisioned." },
      { status: 400 },
    );
  }

  try {
    const result = await createOutboundCall({
      assistantId: voice.vapiAssistantId,
      phoneNumberId: voice.vapiPhoneNumberId,
      customerNumber: e164,
      contactId: null,
      firstMessage: voice.outboundFirstMessage,
      test: true,
      // Hard stop a test call at 60s — long enough to hold a short
      // back-and-forth, capped so a test never runs away.
      maxDurationSeconds: 60,
    });
    return NextResponse.json({
      ok: true,
      callId: result.callId,
      controlUrl: result.controlUrl,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to place the test call";
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
