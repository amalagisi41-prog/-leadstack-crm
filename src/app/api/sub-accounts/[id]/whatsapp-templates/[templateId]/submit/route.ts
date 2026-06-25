import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { subAccountWhatsappIsConfigured } from "@/lib/comms/twilio";
import { publishCallback, qstashIsConfigured } from "@/lib/automations/qstash";
import {
  createContentTemplate,
  submitForWhatsappApproval,
  WhatsappContentError,
} from "@/lib/comms/whatsapp/templates-api";
import { toMetaTemplateName } from "@/lib/comms/whatsapp/template-validation";
import type { SubAccountDoc } from "@/types";
import type { WhatsappTemplateDoc } from "@/types/whatsapp-templates";

export const dynamic = "force-dynamic";

/**
 * Submit a draft (or rejected/failed) WhatsApp template to Meta for approval
 * via Twilio's Content API. Creates the Content resource + the WhatsApp
 * approval request, stores the resulting contentSid, flips the template to
 * "pending", and schedules the first QStash approval poll.
 */

const SUBMITTABLE: ReadonlyArray<string> = ["draft", "rejected", "failed"];

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string; templateId: string }> },
) {
  const { id: subAccountId, templateId } = await ctx.params;
  const auth = await requireSubAccountAdmin(request, subAccountId);
  if (auth instanceof NextResponse) return auth;

  const db = getAdminDb();
  const ref = db.doc(
    `subAccounts/${subAccountId}/whatsappTemplates/${templateId}`,
  );
  const [tplSnap, subSnap] = await Promise.all([
    ref.get(),
    db.doc(`subAccounts/${subAccountId}`).get(),
  ]);
  if (!tplSnap.exists) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }
  const tpl = tplSnap.data() as WhatsappTemplateDoc;
  const sub = subSnap.exists ? (subSnap.data() as SubAccountDoc) : null;

  if (sub?.whatsappEnabledByAgency !== true) {
    return NextResponse.json(
      { error: "WhatsApp is disabled for this sub-account by your agency." },
      { status: 403 },
    );
  }
  if (!subAccountWhatsappIsConfigured(sub?.twilioConfig) || !sub?.twilioConfig) {
    return NextResponse.json(
      {
        error:
          "Configure a WhatsApp sender under Settings → SMS before submitting templates.",
      },
      { status: 400 },
    );
  }
  if (!SUBMITTABLE.includes(tpl.status)) {
    return NextResponse.json(
      { error: `A ${tpl.status} template can't be submitted again.` },
      { status: 409 },
    );
  }

  const name = toMetaTemplateName(tpl.displayName);
  const variablesSample: Record<string, string> = {};
  for (const v of tpl.variables) {
    variablesSample[String(v.position)] = v.sampleValue;
  }

  // Optimistic state so a slow Twilio round-trip shows as in-progress.
  await ref.update({
    status: "submitting",
    name,
    rejectionReason: null,
    updatedAt: FieldValue.serverTimestamp(),
  });

  let contentSid: string;
  try {
    const created = await createContentTemplate({
      accountSid: sub.twilioConfig.accountSid,
      authToken: sub.twilioConfig.authToken,
      friendlyName: name,
      language: tpl.language,
      body: tpl.body,
      variables: variablesSample,
    });
    contentSid = created.contentSid;
    await submitForWhatsappApproval({
      accountSid: sub.twilioConfig.accountSid,
      authToken: sub.twilioConfig.authToken,
      contentSid,
      name,
      category: tpl.category,
    });
  } catch (err) {
    const detail =
      err instanceof WhatsappContentError
        ? `${err.message} (${err.status})${err.body ? `: ${err.body.slice(0, 300)}` : ""}`
        : err instanceof Error
          ? err.message
          : "Unknown error";
    await ref.update({
      status: "failed",
      rejectionReason: detail,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return NextResponse.json(
      { error: `Submission failed: ${detail}` },
      { status: 502 },
    );
  }

  await ref.update({
    status: "pending",
    contentSid,
    rejectionReason: null,
    pollAttempts: 0,
    lastSyncedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  // Schedule the first approval poll. If QStash isn't configured the template
  // stays "pending" until the operator re-submits — log so it's diagnosable.
  if (qstashIsConfigured()) {
    await publishCallback({
      pathname: `/api/sub-accounts/${subAccountId}/whatsapp-templates/poll`,
      body: { subAccountId, templateId, contentSid },
      delaySeconds: 20,
      deduplicationId: `watpl_${subAccountId}_${templateId}_0`,
    });
  } else {
    console.warn(
      `[whatsapp-templates/submit] QStash not configured — template ${templateId} won't auto-sync approval status`,
    );
  }

  const updated = await ref.get();
  return NextResponse.json({ ok: true, template: { id: ref.id, ...updated.data() } });
}
