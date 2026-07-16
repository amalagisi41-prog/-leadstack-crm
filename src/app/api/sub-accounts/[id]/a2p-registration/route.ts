import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { getAdminDb } from "@/lib/firebase/admin";
import { emailIsConfigured, sendEmail } from "@/lib/comms/resend";
import type { A2pCarrierStatus, A2pRegistration, SubAccountDoc } from "@/types";

const VALID_STATUSES: A2pCarrierStatus[] = [
  "not_started",
  "draft",
  "submitted",
  "in_review",
  "approved",
  "rejected",
];

function str(value: unknown, max = 500): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function strArray(value: unknown, maxItems = 3, maxChars = 280): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim().slice(0, maxChars))
    .filter(Boolean)
    .slice(0, maxItems);
}

function normalizeStatus(value: unknown): A2pCarrierStatus {
  return VALID_STATUSES.includes(value as A2pCarrierStatus)
    ? (value as A2pCarrierStatus)
    : "draft";
}

function buildDefaultRegistration(subName: string | null | undefined): A2pRegistration {
  return {
    status: "not_started",
    businessLegalName: subName ?? "",
    businessType: "",
    supportEmail: "",
    supportPhone: "",
    websiteUrl: "",
    useCaseSummary: "",
    sampleMessages: ["", "", ""],
    emailUpdates: true,
    updateEmail: null,
    lastStatusNote: null,
    lastStatusChangedAt: null,
    submittedAt: null,
    approvedAt: null,
    rejectedAt: null,
  };
}

function mergeRegistration(
  existing: A2pRegistration | null | undefined,
  subName: string | null | undefined,
  body: Record<string, unknown>,
): A2pRegistration {
  const base = existing ?? buildDefaultRegistration(subName);
  const nextStatus = normalizeStatus(body.status ?? base.status);

  return {
    ...base,
    status: nextStatus,
    businessLegalName: str(body.businessLegalName ?? base.businessLegalName, 200),
    businessType: str(body.businessType ?? base.businessType, 100),
    supportEmail: str(body.supportEmail ?? base.supportEmail, 200),
    supportPhone: str(body.supportPhone ?? base.supportPhone, 60),
    websiteUrl: str(body.websiteUrl ?? base.websiteUrl, 300),
    useCaseSummary: str(body.useCaseSummary ?? base.useCaseSummary, 1000),
    sampleMessages: (() => {
      const provided = strArray(body.sampleMessages, 3, 280);
      if (provided.length === 0) return base.sampleMessages;
      return [provided[0] ?? "", provided[1] ?? "", provided[2] ?? ""];
    })(),
    emailUpdates:
      typeof body.emailUpdates === "boolean"
        ? body.emailUpdates
        : base.emailUpdates,
    updateEmail: str(body.updateEmail ?? base.updateEmail, 200) || null,
    lastStatusNote: str(body.lastStatusNote ?? base.lastStatusNote, 500) || null,
    lastStatusChangedAt: base.lastStatusChangedAt,
    submittedAt: base.submittedAt,
    approvedAt: base.approvedAt,
    rejectedAt: base.rejectedAt,
  };
}

function statusLabel(status: A2pCarrierStatus): string {
  switch (status) {
    case "not_started":
      return "Not started";
    case "draft":
      return "Draft";
    case "submitted":
      return "Submitted";
    case "in_review":
      return "In review";
    case "approved":
      return "Approved";
    case "rejected":
      return "Rejected";
  }
}

async function maybeSendStatusEmail(input: {
  subAccountName: string;
  status: A2pCarrierStatus;
  note: string | null;
  to: string | null;
}) {
  if (!input.to || !emailIsConfigured()) return;

  const subject = `A2P registration update: ${statusLabel(input.status)}`;
  const noteBlock = input.note ? `\n\nNote: ${input.note}` : "";
  const text = `Your A2P registration for ${input.subAccountName} is now marked "${statusLabel(
    input.status,
  )}".${noteBlock}\n\nYou can review it anytime inside AgentStack under Settings → Messaging → A2P registration.`;
  const html = `<p>Your A2P registration for <strong>${input.subAccountName}</strong> is now marked <strong>${statusLabel(
    input.status,
  )}</strong>.</p>${
    input.note ? `<p><strong>Note:</strong> ${input.note}</p>` : ""
  }<p>You can review it anytime inside AgentStack under <strong>Settings → Messaging → A2P registration</strong>.</p>`;

  await sendEmail({ to: input.to, subject, text, html });
}

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const db = getAdminDb();
  const ref = db.doc(`subAccounts/${subAccountId}`);
  const snap = await ref.get();
  if (!snap.exists) {
    return NextResponse.json({ error: "Sub-account not found" }, { status: 404 });
  }

  const sub = snap.data() as SubAccountDoc;
  const existing = sub.a2pRegistration ?? null;
  const next = mergeRegistration(existing, sub.name, body);
  const statusChanged = existing?.status !== next.status;

  const updates: Record<string, unknown> = {
    a2pRegistration: next,
    updatedAt: FieldValue.serverTimestamp(),
  };

  if (statusChanged) {
    updates["a2pRegistration.lastStatusChangedAt"] = FieldValue.serverTimestamp();
    if (next.status === "submitted" || next.status === "in_review") {
      updates["a2pRegistration.submittedAt"] = FieldValue.serverTimestamp();
    }
    if (next.status === "approved") {
      updates["a2pRegistration.approvedAt"] = FieldValue.serverTimestamp();
    }
    if (next.status === "rejected") {
      updates["a2pRegistration.rejectedAt"] = FieldValue.serverTimestamp();
    }
  }

  await ref.set(updates, { merge: true });

  if (statusChanged && next.emailUpdates) {
    try {
      await maybeSendStatusEmail({
        subAccountName: sub.name ?? "your workspace",
        status: next.status,
        note: next.lastStatusNote,
        to: next.updateEmail || next.supportEmail || null,
      });
    } catch (err) {
      console.warn("[a2p-registration] status email failed", err);
    }
  }

  return NextResponse.json({ ok: true, registration: next });
}
