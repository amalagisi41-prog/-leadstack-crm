import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { GLOBAL_TERRITORY_ID } from "@/types";
import type { SubAccountDoc } from "@/types";
import { getAgentProfile } from "@/lib/comms/ai/agent";
import { emailIsConfigured, sendEmail, tenantFrom } from "@/lib/comms/resend";
import type { IdxListingDoc } from "@/types/idx";

/**
 * Post-inquiry obligations for a public "Request a showing" submission on
 * an IDX listing detail page: a follow-up Task due end-of-today, plus an
 * escalation email so the realtor doesn't have to be staring at the
 * dashboard to catch a hot lead. Mirrors the shape of
 * lib/comms/ai/follow-up.ts's createCaptureFollowUp, but decoupled from the
 * AI Agent channel model — IDX inquiries aren't an AI channel, so there's
 * no per-channel escalation override to resolve. Falls back to the shared
 * AI Agent profile's `escalationNotifyEmail` (the existing "who gets
 * notified about a new lead" setting) since that's already what every
 * other capture surface uses; skips the email (not the Task) if it's
 * unset or Resend isn't configured.
 *
 * Both steps are best-effort — a failure here can't be allowed to break
 * the visitor's "thanks, we'll be in touch" confirmation.
 */

interface CreateIdxInquiryFollowUpInput {
  agencyId: string;
  subAccountId: string;
  contactId: string;
  listing: Pick<IdxListingDoc, "id" | "address" | "city" | "state" | "price">;
  inquirerName: string | null;
  inquirerEmail: string | null;
  inquirerPhone: string | null;
  message: string | null;
  listingUrl: string;
}

export interface IdxInquiryFollowUpResult {
  taskId: string | null;
  emailSent: boolean;
  errors: string[];
}

export async function createIdxInquiryFollowUp(
  input: CreateIdxInquiryFollowUpInput
): Promise<IdxInquiryFollowUpResult> {
  const errors: string[] = [];
  const listingLabel = input.listing.address || `Listing ${input.listing.id}`;
  const identity =
    input.inquirerName ||
    input.inquirerEmail ||
    input.inquirerPhone ||
    "A visitor";

  // ----- 1. Create the Task -----
  let taskId: string | null = null;
  try {
    const db = getAdminDb();
    const now = new Date();
    const dueAt = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      23,
      59,
      59
    );

    const notes = [
      `Requested a showing/info for: ${listingLabel}`,
      `Listing: ${input.listingUrl}`,
      input.inquirerEmail ? `Email: ${input.inquirerEmail}` : null,
      input.inquirerPhone ? `Phone: ${input.inquirerPhone}` : null,
      input.message ? `\nMessage:\n"${input.message}"` : null,
    ]
      .filter(Boolean)
      .join("\n");

    let territoryId: string = GLOBAL_TERRITORY_ID;
    try {
      const cSnap = await db.collection("contacts").doc(input.contactId).get();
      territoryId =
        (cSnap.data()?.territoryId as string | null | undefined) ??
        GLOBAL_TERRITORY_ID;
    } catch {
      territoryId = GLOBAL_TERRITORY_ID;
    }

    const taskRef = await db.collection("tasks").add({
      title: `Follow up with ${identity} about ${listingLabel}`,
      notes,
      dueAt,
      completed: false,
      completedAt: null,
      contactId: input.contactId,
      dealId: null,
      eventId: null,
      agencyId: input.agencyId,
      subAccountId: input.subAccountId,
      createdByUid: "idx-listing-inquiry",
      territoryId,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    taskId = taskRef.id;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error(
      `[idx/inquiry-follow-up] task create failed sa=${input.subAccountId}`,
      err
    );
    errors.push(`task: ${msg}`);
  }

  // ----- 2. Send the escalation email -----
  let emailSent = false;
  if (!emailIsConfigured()) {
    errors.push("email: not configured");
  } else {
    try {
      const db = getAdminDb();
      const [profile, subSnap] = await Promise.all([
        getAgentProfile(input.subAccountId),
        db.doc(`subAccounts/${input.subAccountId}`).get(),
      ]);
      const subAccount = subSnap.data() as SubAccountDoc | undefined;
      const to = profile?.escalationNotifyEmail?.trim();
      if (!to) {
        errors.push("email: no escalation address configured");
      } else {
        const appUrl =
          process.env.NEXT_PUBLIC_APP_URL?.trim() ||
          "https://agentstackcrm.app";
        const contactUrl = `${appUrl}/sa/${input.subAccountId}/contacts/${input.contactId}`;
        const priceLabel = input.listing.price
          ? ` ($${input.listing.price.toLocaleString()})`
          : "";

        const subject = `New showing request: ${listingLabel}`;
        const text = [
          `${identity} requested a showing / more info on ${listingLabel}${priceLabel}.`,
          "",
          input.inquirerEmail ? `Email: ${input.inquirerEmail}` : null,
          input.inquirerPhone ? `Phone: ${input.inquirerPhone}` : null,
          input.message ? `\nMessage:\n${input.message}` : null,
          "",
          `Listing: ${input.listingUrl}`,
          `Contact: ${contactUrl}`,
          "",
          "A follow-up task has been created in your Tasks list, due today.",
        ]
          .filter((s): s is string => s !== null)
          .join("\n");

        await sendEmail({
          to,
          subject,
          text,
          from: tenantFrom(subAccount),
        });
        emailSent = true;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.error(
        `[idx/inquiry-follow-up] email send failed sa=${input.subAccountId}`,
        err
      );
      errors.push(`email: ${msg}`);
    }
  }

  return { taskId, emailSent, errors };
}
