import "server-only";

import { FieldValue, type Timestamp } from "firebase-admin/firestore";
import { CUSTOM_BRAND } from "@/config/landing";
import { publishCallback, qstashIsConfigured } from "@/lib/automations/qstash";
import { emailIsConfigured, sendEmail } from "@/lib/comms/resend";
import { getAdminDb } from "@/lib/firebase/admin";
import type {
  OnboardingLifecycleCadenceId,
  OnboardingLifecycleEmails,
  SubAccountDoc,
} from "@/types/tenancy";
import {
  ONBOARDING_METHOD_STEPS,
  type OnboardingMethodStepId,
  type OnboardingMethodStepMeta,
  isOnboardingMethodStepComplete,
} from "./steps";

const QUEUE_LOCK_TTL_MS = 5 * 60 * 1000;

const CADENCES: Array<{
  id: OnboardingLifecycleCadenceId;
  label: string;
  delaySeconds: number;
  intro: string;
}> = [
  {
    id: "day0",
    label: "Day 0",
    delaySeconds: 5 * 60,
    intro:
      "Your workspace is ready. The fastest win is to finish the next setup step while everything is fresh.",
  },
  {
    id: "day1",
    label: "Day 1",
    delaySeconds: 24 * 60 * 60,
    intro:
      "If setup got pushed aside yesterday, here’s the shortest path back in.",
  },
  {
    id: "day3",
    label: "Day 3",
    delaySeconds: 3 * 24 * 60 * 60,
    intro:
      "Most teams start feeling the payoff once this next step is live.",
  },
  {
    id: "day7",
    label: "Day 7",
    delaySeconds: 7 * 24 * 60 * 60,
    intro:
      "One last onboarding check-in — we want to make sure nothing important is still blocking you.",
  },
];

type Recipient = {
  email: string;
  firstName: string;
};

type StepSupportCopy = {
  question: string;
  answer: string;
  helpHref: string | null;
  helpLabel: string | null;
  ctaLabel: string;
};

const STEP_SUPPORT: Record<OnboardingMethodStepId, StepSupportCopy> = {
  build: {
    question: "What should I put in my business profile first?",
    answer:
      "Start with the basics that power every reply and workflow: your business name, service area, hours, and how you want follow-up to sound. Once that is saved, the rest of the system has real context to work with.",
    helpHref: "/help",
    helpLabel: "Open the Help Center",
    ctaLabel: "Finish your business profile",
  },
  connect: {
    question: "How do I bring my contacts and phone setup over without making a mess?",
    answer:
      "Import your contacts first, review duplicates before they are committed, then connect your texting number. That gives AgentStack real people to work and a live channel to reply through.",
    helpHref: "/help/import-contacts",
    helpLabel: "Read the import guide",
    ctaLabel: "Connect your contacts and channels",
  },
  capture: {
    question: "What should I launch first to start capturing leads?",
    answer:
      "Start with one live capture point — usually a buyer lead form, seller valuation request, or open-house sign-in. One working form is enough to start feeding your pipeline immediately.",
    helpHref: "/help/lead-forms",
    helpLabel: "See the lead-forms guide",
    ctaLabel: "Launch your first capture flow",
  },
  respond: {
    question: "How do I know the AI and follow-up are actually live?",
    answer:
      "Save your AI persona, run a test conversation, then switch on the response workflow. Once that’s done, every new inquiry gets an immediate first touch instead of waiting on you to be free.",
    helpHref: "/help/ai-persona-setup",
    helpLabel: "Review AI persona setup",
    ctaLabel: "Turn on instant response",
  },
};

function tsToDate(
  value: Timestamp | Date | null | undefined,
): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value.toDate === "function") return value.toDate();
  return null;
}

function getCadence(id: OnboardingLifecycleCadenceId) {
  return CADENCES.find((cadence) => cadence.id === id) ?? null;
}

function getMethodStep(
  completed: string[] | null | undefined,
): OnboardingMethodStepMeta | null {
  for (const step of ONBOARDING_METHOD_STEPS) {
    if (!isOnboardingMethodStepComplete(step, completed)) {
      return step;
    }
  }
  return null;
}

function getSentAt(
  state: OnboardingLifecycleEmails | null | undefined,
  cadenceId: OnboardingLifecycleCadenceId,
): Date | null {
  const key = `${cadenceId}SentAt` as const;
  return tsToDate(state?.[key] as Timestamp | Date | null | undefined);
}

function isQueued(state: OnboardingLifecycleEmails | null | undefined): boolean {
  return Boolean(state?.queuedAt || state?.day0SentAt);
}

function buildSetupUrl(subAccountId: string, stepId: OnboardingMethodStepId): string | null {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (!baseUrl) return null;
  return `${baseUrl}/sa/${subAccountId}/get-started?step=${stepId}`;
}

function buildAbsoluteUrl(pathname: string): string | null {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (!baseUrl) return null;
  return `${baseUrl}${pathname}`;
}

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function resolveRecipient(subAccount: Pick<SubAccountDoc, "createdByUid" | "id">): Promise<Recipient | null> {
  const db = getAdminDb();

  const creatorSnap = await db.doc(`users/${subAccount.createdByUid}`).get();
  if (creatorSnap.exists) {
    const creator = creatorSnap.data() as
      | { email?: string | null; displayName?: string | null }
      | undefined;
    const email = creator?.email?.trim().toLowerCase() ?? "";
    if (email) {
      const displayName = creator?.displayName?.trim() || email.split("@")[0] || "there";
      return { email, firstName: displayName.split(" ")[0] || "there" };
    }
  }

  const membersSnap = await getAdminDb()
    .collection(`subAccounts/${subAccount.id}/subAccountMembers`)
    .get();

  const members = membersSnap.docs
    .map((doc) => doc.data() as { role?: string; status?: string; email?: string; displayName?: string })
    .filter((member) => member.status === "active" && member.email);

  const admin = members.find((member) => member.role === "admin") ?? members[0];
  if (!admin?.email) return null;

  const firstName =
    admin.displayName?.trim().split(" ")[0] ||
    admin.email.split("@")[0] ||
    "there";

  return {
    email: admin.email.trim().toLowerCase(),
    firstName,
  };
}

export async function queueOnboardingLifecycleSequence(
  subAccountId: string,
): Promise<{ queued: boolean; reason: string }> {
  if (!qstashIsConfigured()) {
    return { queued: false, reason: "qstash_not_configured" };
  }

  const db = getAdminDb();
  const ref = db.doc(`subAccounts/${subAccountId}`);

  const claimed = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return false;

    const data = snap.data() as SubAccountDoc;
    if (getMethodStep(data.onboardingStepsCompleted) === null) {
      tx.update(ref, {
        "onboardingLifecycleEmails.completedAt": FieldValue.serverTimestamp(),
      });
      return false;
    }

    const lifecycle = data.onboardingLifecycleEmails;
    const lockAge =
      typeof lifecycle?.queueLockedAt === "number"
        ? Date.now() - lifecycle.queueLockedAt
        : null;

    if (
      isQueued(lifecycle) ||
      (lockAge !== null && lockAge < QUEUE_LOCK_TTL_MS)
    ) {
      return false;
    }

    tx.update(ref, {
      "onboardingLifecycleEmails.queueLockedAt": Date.now(),
      "onboardingLifecycleEmails.lastQueueAttemptAt":
        FieldValue.serverTimestamp(),
    });
    return true;
  });

  if (!claimed) {
    return { queued: false, reason: "already_queued" };
  }

  let successCount = 0;
  for (const cadence of CADENCES) {
    const result = await publishCallback({
      pathname: "/api/onboarding/lifecycle/step",
      body: { subAccountId, cadenceId: cadence.id },
      delaySeconds: cadence.delaySeconds,
      deduplicationId: `onboarding_${subAccountId}_${cadence.id}`,
    });
    if (result) successCount += 1;
  }

  if (successCount > 0) {
    await ref.update({
      "onboardingLifecycleEmails.queueLockedAt": null,
      "onboardingLifecycleEmails.queuedAt": FieldValue.serverTimestamp(),
      "onboardingLifecycleEmails.lastQueueAttemptAt":
        FieldValue.serverTimestamp(),
    });
    return { queued: true, reason: "scheduled" };
  }

  await ref.update({
    "onboardingLifecycleEmails.queueLockedAt": null,
    "onboardingLifecycleEmails.lastQueueAttemptAt":
      FieldValue.serverTimestamp(),
  });

  return { queued: false, reason: "publish_failed" };
}

export async function sendOnboardingLifecycleEmail({
  subAccount,
  cadenceId,
}: {
  subAccount: SubAccountDoc;
  cadenceId: OnboardingLifecycleCadenceId;
}): Promise<
  | { status: "ignored"; reason: string }
  | {
      status: "sent";
      cadenceId: OnboardingLifecycleCadenceId;
      recipientEmail: string;
      messageId: string;
      stepId: OnboardingMethodStepId;
    }
> {
  const cadence = getCadence(cadenceId);
  if (!cadence) {
    return { status: "ignored", reason: "unknown_cadence" };
  }

  if (!emailIsConfigured()) {
    throw new Error("Email is not configured on this deployment.");
  }

  if (subAccount.status !== "active") {
    return { status: "ignored", reason: "inactive_sub_account" };
  }

  if (getSentAt(subAccount.onboardingLifecycleEmails, cadenceId)) {
    return { status: "ignored", reason: "already_sent" };
  }

  const nextStep = getMethodStep(subAccount.onboardingStepsCompleted);
  if (!nextStep) {
    return { status: "ignored", reason: "onboarding_complete" };
  }

  const recipient = await resolveRecipient(subAccount);
  if (!recipient) {
    return { status: "ignored", reason: "no_recipient" };
  }

  const support = STEP_SUPPORT[nextStep.id];
  const setupUrl = buildSetupUrl(subAccount.id, nextStep.id);
  const helpUrl = support.helpHref ? buildAbsoluteUrl(support.helpHref) : null;
  const subject = `${cadence.label}: ${support.ctaLabel} in ${CUSTOM_BRAND.name}`;

  const text = [
    `Hi ${recipient.firstName},`,
    "",
    cadence.intro,
    "",
    `Your next recommended action: ${nextStep.title}`,
    "",
    `Question we usually hear at this point: ${support.question}`,
    support.answer,
    "",
    setupUrl ? `${support.ctaLabel}: ${setupUrl}` : null,
    helpUrl && support.helpLabel ? `${support.helpLabel}: ${helpUrl}` : null,
    "",
    `Need a hand? Reply to this email or contact ${CUSTOM_BRAND.supportEmail}.`,
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#f7f4ee;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#173b7a;">
    <div style="max-width:620px;margin:0 auto;background:#ffffff;border:1px solid #e9dfd0;border-radius:18px;padding:32px;">
      <p style="margin:0 0 8px;font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#db4f9b;">${esc(cadence.label)} onboarding note</p>
      <h1 style="margin:0 0 12px;font-size:28px;line-height:1.15;color:#173b7a;">${esc(nextStep.title)}</h1>
      <p style="margin:0 0 18px;font-size:16px;line-height:1.7;color:#4e648f;">Hi ${esc(recipient.firstName)},</p>
      <p style="margin:0 0 18px;font-size:16px;line-height:1.7;color:#4e648f;">${esc(cadence.intro)}</p>

      <div style="margin:24px 0;padding:20px;border:1px solid #e9dfd0;border-radius:16px;background:#fff8ee;">
        <p style="margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#173b7a;">Your next recommended action</p>
        <p style="margin:0;font-size:22px;font-weight:700;line-height:1.3;color:#173b7a;">${esc(nextStep.title)}</p>
      </div>

      <p style="margin:0 0 8px;font-size:14px;font-weight:700;color:#173b7a;">Question we usually hear at this point</p>
      <p style="margin:0 0 8px;font-size:18px;line-height:1.5;color:#173b7a;">${esc(support.question)}</p>
      <p style="margin:0 0 24px;font-size:15px;line-height:1.7;color:#4e648f;">${esc(support.answer)}</p>

      ${
        setupUrl
          ? `<p style="margin:0 0 18px;"><a href="${esc(setupUrl)}" style="display:inline-block;background:#173b7a;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:999px;font-size:14px;font-weight:700;">${esc(support.ctaLabel)}</a></p>`
          : ""
      }

      ${
        helpUrl && support.helpLabel
          ? `<p style="margin:0 0 20px;font-size:14px;line-height:1.7;color:#4e648f;"><a href="${esc(helpUrl)}" style="color:#173b7a;font-weight:600;text-decoration:none;">${esc(support.helpLabel)}</a></p>`
          : ""
      }

      <div style="padding-top:18px;border-top:1px solid #efe6da;">
        <p style="margin:0;font-size:13px;line-height:1.7;color:#7a88a8;">Need a hand? Reply to this email or contact ${esc(CUSTOM_BRAND.supportEmail)}.</p>
      </div>
    </div>
  </body>
</html>`;

  const { id } = await sendEmail({
    to: recipient.email,
    subject,
    text,
    html,
  });

  return {
    status: "sent",
    cadenceId,
    recipientEmail: recipient.email,
    messageId: id,
    stepId: nextStep.id,
  };
}

