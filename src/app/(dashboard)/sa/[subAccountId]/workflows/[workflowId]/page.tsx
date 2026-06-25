import { WorkflowBuilderLoader } from "@/components/workflows/workflow-builder-loader";
import type { BuilderReadiness } from "@/components/workflows/workflow-builder";
import { getAdminDb } from "@/lib/firebase/admin";
import { agencyAllowsSharedSms } from "@/lib/agency/policy";
import { emailIsConfigured, tenantFrom } from "@/lib/comms/resend";
import {
  smsIsConfigured,
  subAccountTwilioIsConfigured,
  subAccountWhatsappIsConfigured,
} from "@/lib/comms/twilio";
import type { SubAccountDoc } from "@/types";

export const dynamic = "force-dynamic";

export default async function WorkflowBuilderPage({
  params,
}: {
  params: Promise<{ subAccountId: string; workflowId: string }>;
}) {
  const { subAccountId, workflowId } = await params;

  // Resolve which send-integrations can ACTUALLY run, server-side. Every input
  // is readable here — the deployment env vars, the sub-account's own
  // twilioConfig, and (for WhatsApp) its approved-template inventory — so a
  // doomed step is flagged deterministically. This replaces the client's
  // optimistic, defaults-open probe that left a step unflagged whenever the
  // probe failed or hadn't resolved. Mirrors exactly what the engine does at
  // send time (engine.ts execSendSms / execWhatsappTemplate).
  const db = getAdminDb();
  const [snap, approvedWhatsapp] = await Promise.all([
    db.doc(`subAccounts/${subAccountId}`).get(),
    // WhatsApp also needs ≥1 Meta-approved template — with none, every
    // whatsapp_template node is skipped (no template to send), so the channel
    // counts as not-ready even when the gate + sender are configured.
    db
      .collection(`subAccounts/${subAccountId}/whatsappTemplates`)
      .where("status", "==", "approved")
      .limit(1)
      .get(),
  ]);
  const sub = snap.data() as SubAccountDoc | undefined;
  const tc = sub?.twilioConfig ?? null;

  // Each tier evaluated separately so the builder can show a green/red
  // breakdown on the node, not just the final OR/AND. The shared "agency" SMS
  // tier only counts when the env creds exist AND the agency permits sub-
  // accounts to use the shared sender.
  const smsSub = subAccountTwilioIsConfigured(tc);
  const smsAgency = smsIsConfigured() && (await agencyAllowsSharedSms(sub?.agencyId));
  const emailSub = tenantFrom(sub) !== undefined;
  const emailAgency = emailIsConfigured();
  const whatsappGate = sub?.whatsappEnabledByAgency === true;
  const whatsappSender = subAccountWhatsappIsConfigured(tc);
  const whatsappTemplate = !approvedWhatsapp.empty;

  const readiness: BuilderReadiness = {
    emailReady: emailAgency,
    smsReady: smsSub || smsAgency,
    whatsappReady: whatsappGate && whatsappSender && whatsappTemplate,
    detail: {
      smsSub,
      smsAgency,
      emailSub,
      emailAgency,
      whatsappGate,
      whatsappSender,
      whatsappTemplate,
    },
  };

  return (
    <WorkflowBuilderLoader
      saId={subAccountId}
      workflowId={workflowId}
      readiness={readiness}
    />
  );
}
