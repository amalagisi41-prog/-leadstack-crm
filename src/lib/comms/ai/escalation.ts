import "server-only";

import { getAdminDb } from "@/lib/firebase/admin";
import { emailIsConfigured, sendEmail, tenantFrom } from "@/lib/comms/resend";
import type { SubAccountDoc } from "@/types";

/**
 * Case-insensitive substring match against the configured keyword list.
 * Returns the first matched keyword (for logging) or null when none hit.
 */
export function matchEscalationKeyword(
  message: string,
  keywords: string[],
): string | null {
  if (!message) return null;
  const lower = message.toLowerCase();
  for (const raw of keywords) {
    const k = raw.trim().toLowerCase();
    if (!k) continue;
    if (lower.includes(k)) return raw;
  }
  return null;
}

interface EscalationNotificationParams {
  to: string;
  businessName: string;
  contactName: string;
  contactPhone: string;
  contactId: string;
  subAccountId: string;
  triggeredKeyword: string;
  incomingMessage: string;
  /** Deployment app URL — used to build the deep link back to the contact
   *  profile so the operator can pick up the conversation. */
  appUrl: string;
}

/**
 * Sends the "human needed" alert email when an escalation triggers.
 * Best-effort — if Resend isn't configured or the send fails, we log and
 * continue so the rest of the webhook flow isn't blocked.
 */
export async function sendEscalationNotification(
  params: EscalationNotificationParams,
): Promise<string | null> {
  if (!emailIsConfigured()) {
    console.warn(
      "[ai/escalation] Resend not configured — escalation email skipped",
    );
    return null;
  }

  const link = `${params.appUrl}/sa/${params.subAccountId}/contacts/${params.contactId}`;
  const subject = `AI escalation: "${params.triggeredKeyword}" from ${params.contactName || params.contactPhone}`;

  const text = `A lead just triggered an AI escalation for ${params.businessName}.

Lead:        ${params.contactName || "(unnamed)"}
Phone:       ${params.contactPhone}
Triggered:   "${params.triggeredKeyword}"

Their message:
"${params.incomingMessage}"

Pick up the conversation:
${link}

(The AI did NOT reply to this message — it's now waiting for a human.)
`;

  const html = `<!DOCTYPE html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:32px auto;padding:0 16px;color:#1a1a22;line-height:1.6;">
  <h1 style="font-size:18px;font-weight:600;margin:0 0 16px;">AI escalation needs you</h1>
  <p style="margin:0 0 16px;">A lead at <strong>${params.businessName}</strong> just triggered the keyword <strong>&ldquo;${params.triggeredKeyword}&rdquo;</strong>. The AI stayed silent and is waiting for you to pick up.</p>
  <div style="background:#f6f7f9;border-radius:8px;padding:14px 16px;margin:16px 0;font-size:14px;">
    <p style="margin:0 0 4px;"><strong>${params.contactName || "(unnamed lead)"}</strong> &middot; ${params.contactPhone}</p>
    <p style="margin:0;color:#3a3a44;font-style:italic;">&ldquo;${params.incomingMessage}&rdquo;</p>
  </div>
  <p style="margin:24px 0;">
    <a href="${link}" style="display:inline-block;background:#5b5bd6;color:#ffffff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:500;">Open the conversation &rarr;</a>
  </p>
</body></html>`;

  try {
    const subSnap = await getAdminDb()
      .doc(`subAccounts/${params.subAccountId}`)
      .get();
    const subAccount = subSnap.data() as SubAccountDoc | undefined;
    const result = await sendEmail({
      to: params.to,
      subject,
      text,
      html,
      from: tenantFrom(subAccount),
    });
    return result.id;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(
      `[ai/escalation] Notification send failed to ${params.to}: ${message}`,
    );
    return null;
  }
}
