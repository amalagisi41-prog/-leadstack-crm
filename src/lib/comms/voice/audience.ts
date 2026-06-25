import "server-only";

import { parsePhoneNumberFromString } from "libphonenumber-js";
import { Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import type { BroadcastAudienceFilter, VoiceCampaignSuppression } from "@/types";
import type { Contact } from "@/types/contacts";

/** Reasons a contact can be dropped before dialling. */
export type VoiceAudienceSkipReason =
  | "opted_out"
  | "no_phone"
  | "recently_called"
  | "suppressed_tag"
  | "prior_campaign";

/**
 * Resolve a voice campaign's audience filter to the contact set we'll dial.
 *
 * Mirrors lib/broadcasts/audience.ts but pre-filters on PHONE viability
 * instead of email: a contact is skipped here only when they have no valid
 * phone number or have opted out of voice. The per-call compliance gate
 * (calling window, caps, country, scrub) runs later in the step callback —
 * those checks are time/state-dependent so they can't be decided at
 * fan-out time.
 *
 * Reuses BroadcastAudienceFilter (all / tag / pipeline_stage).
 */
export interface ResolvedVoiceAudience {
  recipients: Contact[];
  skipped: Array<{
    contact: Contact;
    reason: VoiceAudienceSkipReason;
  }>;
}

export async function resolveVoiceAudience(
  subAccountId: string,
  filter: BroadcastAudienceFilter,
  /** Territory scoping — same semantics as the broadcast resolver. */
  territoryFilter: string[] | null = null,
  /** Optional cross-campaign suppression (recently-called / tag / prior
   *  campaign). Null = no suppression beyond opt-out + phone validity. */
  suppression: VoiceCampaignSuppression | null = null,
): Promise<ResolvedVoiceAudience> {
  const db = getAdminDb();
  let query: FirebaseFirestore.Query = db
    .collection("contacts")
    .where("subAccountId", "==", subAccountId);

  if (filter.kind === "tag") {
    query = query.where("tags", "array-contains", filter.tag);
  } else if (filter.kind === "pipeline_stage") {
    query = query.where("pipelineStage", "==", filter.stage);
  }

  // Build the suppression inputs up front.
  const recentCutoff =
    suppression?.recentDays && suppression.recentDays > 0
      ? Timestamp.fromMillis(
          Date.now() - suppression.recentDays * 24 * 60 * 60 * 1000,
        )
      : null;
  const excludeTag = suppression?.excludeTag?.trim() || null;

  // Prior-campaign exclusion: load that campaign's recipient contact ids.
  let priorIds: Set<string> | null = null;
  if (suppression?.excludeCampaignId) {
    const priorSnap = await db
      .collection("voiceCampaigns")
      .doc(suppression.excludeCampaignId)
      .collection("recipients")
      .get();
    priorIds = new Set(priorSnap.docs.map((d) => d.id));
  }

  const snap = await query.get();

  const recipients: Contact[] = [];
  const skipped: ResolvedVoiceAudience["skipped"] = [];

  for (const doc of snap.docs) {
    const contact = { id: doc.id, ...(doc.data() as Omit<Contact, "id">) };
    if (territoryFilter) {
      const tId = contact.territoryId ?? null;
      if (!tId || !territoryFilter.includes(tId)) continue;
    }
    if (contact.voiceOptedOut === true) {
      skipped.push({ contact, reason: "opted_out" });
      continue;
    }
    const parsed = contact.phone
      ? parsePhoneNumberFromString(contact.phone)
      : null;
    if (!parsed || !parsed.isValid()) {
      skipped.push({ contact, reason: "no_phone" });
      continue;
    }
    // ----- Suppression layers -----
    if (priorIds && priorIds.has(contact.id)) {
      skipped.push({ contact, reason: "prior_campaign" });
      continue;
    }
    if (excludeTag && (contact.tags ?? []).includes(excludeTag)) {
      skipped.push({ contact, reason: "suppressed_tag" });
      continue;
    }
    if (recentCutoff) {
      const last = contact.lastOutboundCallAt as Timestamp | null | undefined;
      if (
        last &&
        typeof (last as Timestamp).toMillis === "function" &&
        (last as Timestamp).toMillis() >= recentCutoff.toMillis()
      ) {
        skipped.push({ contact, reason: "recently_called" });
        continue;
      }
    }
    recipients.push(contact);
  }

  return { recipients, skipped };
}
