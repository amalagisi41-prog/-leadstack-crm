import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { qstashIsConfigured, verifyQStashSignature } from "@/lib/automations/qstash";
import { getAdminDb } from "@/lib/firebase/admin";
import {
  sendOnboardingLifecycleEmail,
} from "@/lib/onboarding/lifecycle-email";
import {
  isOnboardingComplete,
} from "@/lib/onboarding/steps";
import type {
  OnboardingLifecycleCadenceId,
  SubAccountDoc,
} from "@/types/tenancy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function isCadenceId(value: unknown): value is OnboardingLifecycleCadenceId {
  return value === "day0" || value === "day1" || value === "day3" || value === "day7";
}

/**
 * QStash callback: sends one onboarding lifecycle email for one workspace at
 * one cadence point (day 0 / 1 / 3 / 7). The email always recalculates the
 * live next incomplete Method step at send time, so if the operator makes
 * progress between queue time and send time, the content stays accurate.
 */
export async function POST(request: Request) {
  if (!qstashIsConfigured()) {
    return NextResponse.json({ error: "QStash not configured" }, { status: 503 });
  }

  const signature = request.headers.get("upstash-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 401 });
  }

  const rawBody = await request.text();
  if (!(await verifyQStashSignature(signature, rawBody))) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: {
    subAccountId?: string;
    cadenceId?: string;
  };
  try {
    payload = JSON.parse(rawBody) as {
      subAccountId?: string;
      cadenceId?: string;
    };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const subAccountId = payload.subAccountId?.trim();
  if (!subAccountId) {
    return NextResponse.json({ error: "subAccountId required" }, { status: 400 });
  }
  if (!isCadenceId(payload.cadenceId)) {
    return NextResponse.json({ error: "Valid cadenceId required" }, { status: 400 });
  }

  const db = getAdminDb();
  const ref = db.doc(`subAccounts/${subAccountId}`);
  const snap = await ref.get();
  if (!snap.exists) {
    return NextResponse.json({ ok: true, ignored: "missing_sub_account" });
  }

  const subAccount = snap.data() as SubAccountDoc;
  if (isOnboardingComplete(subAccount.onboardingStepsCompleted)) {
    await ref.update({
      "onboardingLifecycleEmails.completedAt": FieldValue.serverTimestamp(),
    });
    return NextResponse.json({ ok: true, ignored: "already_complete" });
  }

  let result;
  try {
    result = await sendOnboardingLifecycleEmail({
      subAccount,
      cadenceId: payload.cadenceId,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "send failed",
      },
      { status: 503 },
    );
  }

  if (result.status === "ignored") {
    if (result.reason === "onboarding_complete") {
      await ref.update({
        "onboardingLifecycleEmails.completedAt": FieldValue.serverTimestamp(),
      });
    }
    return NextResponse.json({ ok: true, ignored: result.reason });
  }

  await ref.update({
    [`onboardingLifecycleEmails.${result.cadenceId}SentAt`]:
      FieldValue.serverTimestamp(),
    [`onboardingLifecycleEmails.${result.cadenceId}MessageId`]: result.messageId,
    [`onboardingLifecycleEmails.${result.cadenceId}RecipientEmail`]:
      result.recipientEmail,
    [`onboardingLifecycleEmails.${result.cadenceId}StepId`]: result.stepId,
  });

  return NextResponse.json({
    ok: true,
    sent: true,
    cadenceId: result.cadenceId,
    stepId: result.stepId,
    recipientEmail: result.recipientEmail,
  });
}
