import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { subAccountWhatsappIsConfigured } from "@/lib/comms/twilio";
import {
  DEFAULT_REVIEW_COOLDOWN_DAYS,
  DEFAULT_REVIEW_SMS_TEMPLATE,
  normalizeReviewChannel,
} from "@/lib/reviews/constants";
import type { SubAccountDoc } from "@/types";
import type { GoogleReviewConfig } from "@/types/tenancy";
import type { WhatsappTemplateDoc } from "@/types/whatsapp-templates";

/**
 * Manage the per-sub-account Google review-request config.
 *
 * POST — save the config. Admin-only. Server-side validation mirrors the UI
 *   gating so a client can't bypass it: https review URL, SMS body must contain
 *   {{reviewUrl}}, and a WhatsApp channel requires the agency WhatsApp gate ON +
 *   a configured sender + an APPROVED template.
 * DELETE — clear the config.
 */

interface PostBody {
  enabled?: boolean;
  reviewUrl?: string;
  channel?: "sms" | "whatsapp_template" | "whatsapp_manual";
  messageTemplate?: string;
  whatsappTemplateId?: string | null;
  cooldownDays?: number;
  triggerOnQuotePaid?: boolean;
  triggerOnDealCompleted?: boolean;
}

function isHttpsUrl(s: string): boolean {
  try {
    return new URL(s).protocol === "https:";
  } catch {
    return false;
  }
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

  const reviewUrl = body.reviewUrl?.trim() ?? "";
  if (!reviewUrl || !isHttpsUrl(reviewUrl)) {
    return NextResponse.json(
      { error: "Enter a valid https Google review link." },
      { status: 400 },
    );
  }

  const channel = normalizeReviewChannel(body.channel);
  const isWhatsapp = channel !== "sms";
  const messageTemplate =
    body.messageTemplate?.trim() || DEFAULT_REVIEW_SMS_TEMPLATE;

  // Free-form modes (sms + whatsapp_manual) put the link in the body.
  if (channel !== "whatsapp_template" && !messageTemplate.includes("{{reviewUrl}}")) {
    return NextResponse.json(
      { error: "The message must include {{reviewUrl}} so the link is sent." },
      { status: 400 },
    );
  }

  let whatsappTemplateId: string | null = null;
  if (isWhatsapp) {
    // Tie into the agency-level WhatsApp activation: the gate must be ON and a
    // sender configured for EITHER WhatsApp mode. (The UI greys these out
    // without them; enforced here too so it can't be bypassed and so a save is
    // refused if the agency later turns WhatsApp off.)
    const subSnap = await getAdminDb().doc(`subAccounts/${subAccountId}`).get();
    const sub = subSnap.exists ? (subSnap.data() as SubAccountDoc) : null;
    if (sub?.whatsappEnabledByAgency !== true) {
      return NextResponse.json(
        {
          error:
            "WhatsApp is disabled for this sub-account by your agency. Ask the agency owner to enable WhatsApp first.",
        },
        { status: 403 },
      );
    }
    if (!subAccountWhatsappIsConfigured(sub?.twilioConfig)) {
      return NextResponse.json(
        {
          error:
            "Add a WhatsApp sender under Settings → SMS before using WhatsApp for review requests.",
        },
        { status: 400 },
      );
    }

    // Only the TEMPLATE mode needs an approved template. Manual mode is
    // free-form (in-window) and carries no template.
    if (channel === "whatsapp_template") {
      whatsappTemplateId = body.whatsappTemplateId?.trim() || null;
      if (!whatsappTemplateId) {
        return NextResponse.json(
          { error: "Pick an approved WhatsApp template for review requests." },
          { status: 400 },
        );
      }
      const tplSnap = await getAdminDb()
        .doc(`subAccounts/${subAccountId}/whatsappTemplates/${whatsappTemplateId}`)
        .get();
      const tpl = tplSnap.exists ? (tplSnap.data() as WhatsappTemplateDoc) : null;
      if (!tpl || tpl.status !== "approved" || !tpl.contentSid) {
        return NextResponse.json(
          { error: "That WhatsApp template isn't approved yet — only approved templates can be used." },
          { status: 400 },
        );
      }
    }
  }

  const cooldownDays = clampCooldown(body.cooldownDays);

  const cfg: GoogleReviewConfig = {
    enabled: body.enabled === true,
    reviewUrl,
    channel,
    messageTemplate,
    whatsappTemplateId,
    cooldownDays,
    triggerOnQuotePaid: body.triggerOnQuotePaid === true,
    triggerOnDealCompleted: body.triggerOnDealCompleted === true,
    updatedAt: new Date(),
  };

  await getAdminDb()
    .doc(`subAccounts/${subAccountId}`)
    .set(
      { googleReviewConfig: cfg, updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );

  return NextResponse.json({ ok: true });
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
    .set(
      { googleReviewConfig: null, updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );

  return NextResponse.json({ ok: true });
}

function clampCooldown(v: number | undefined): number {
  if (typeof v !== "number" || !Number.isFinite(v)) {
    return DEFAULT_REVIEW_COOLDOWN_DAYS;
  }
  return Math.max(0, Math.min(3650, Math.round(v)));
}
