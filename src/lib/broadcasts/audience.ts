import "server-only";

import { getAdminDb } from "@/lib/firebase/admin";
import type { BroadcastAudienceFilter } from "@/types";
import type { Contact } from "@/types/contacts";

/**
 * Resolve a broadcast's audience filter to the contact set we'll fan out to.
 *
 * The query is scoped by sub-account first (drives the index), then narrowed
 * by the optional filter. The pre-flight skip (opted-out / missing email) is
 * applied here so we can show "audience N, will-skip M" in the confirm
 * dialog without a second round-trip — and so the parent broadcast doc's
 * totals.audienceSize matches what we actually queue, never wider.
 *
 * v1 supports three filter shapes:
 *   - { kind: "all" }                            — every contact in the sub-account
 *   - { kind: "tag", tag }                       — contacts whose tags array contains tag
 *   - { kind: "pipeline_stage", stage }          — contacts whose pipelineStage matches
 *
 * v2 will replace this with a saved Smart List doc reference and stack
 * filters (tag AND stage AND source AND ...).
 */
export interface ResolvedAudience {
  /** Contacts that will receive a send (passed all pre-flight checks). */
  recipients: Contact[];
  /** Contacts excluded by pre-flight (opt-out / missing email). */
  skipped: Array<{
    contact: Contact;
    reason: "opt_out" | "no_email";
  }>;
}

export async function resolveAudience(
  subAccountId: string,
  filter: BroadcastAudienceFilter,
  /**
   * Territory scoping. `null` (default) = no restriction (admin / owner
   * / scoping off). A `string[]` restricts the audience to contacts
   * whose `territoryId` is in the list — used when a scoped
   * collaborator initiates the broadcast so they can't blast contacts
   * outside their territory. An empty array yields an empty audience.
   * Territory-excluded contacts are dropped silently (not surfaced in
   * `skipped`) so the collaborator never learns they exist.
   */
  territoryFilter: string[] | null = null,
): Promise<ResolvedAudience> {
  const db = getAdminDb();
  let query: FirebaseFirestore.Query = db
    .collection("contacts")
    .where("subAccountId", "==", subAccountId);

  if (filter.kind === "tag") {
    query = query.where("tags", "array-contains", filter.tag);
  } else if (filter.kind === "pipeline_stage") {
    query = query.where("pipelineStage", "==", filter.stage);
  }

  const snap = await query.get();

  const recipients: Contact[] = [];
  const skipped: ResolvedAudience["skipped"] = [];

  for (const doc of snap.docs) {
    const contact = { id: doc.id, ...(doc.data() as Omit<Contact, "id">) };
    // Territory gate first — excluded contacts are invisible to this
    // caller, so they don't even count as "skipped".
    if (territoryFilter) {
      const tId = contact.territoryId ?? null;
      if (!tId || !territoryFilter.includes(tId)) continue;
    }
    if (contact.emailOptedOut) {
      skipped.push({ contact, reason: "opt_out" });
      continue;
    }
    if (!contact.email || !contact.email.includes("@")) {
      skipped.push({ contact, reason: "no_email" });
      continue;
    }
    recipients.push(contact);
  }

  return { recipients, skipped };
}
