import "server-only";

import { FieldValue, type Firestore } from "firebase-admin/firestore";

/**
 * The worked example every new workspace starts with.
 *
 * An empty CRM is the hardest thing to learn from: a first-time agent opens
 * the pipeline, sees six empty columns, and has no idea what belongs in them.
 * A handful of obviously-fictional deals answers that in one glance.
 *
 * Two rules hold this file together.
 *
 *   1. **It must never read as the client's own work.** Every record carries
 *      `isSample: true`, and `lib/onboarding/read-signals.ts` subtracts those
 *      from its counts — so a workspace holding only this example still
 *      reports "No deals in your pipeline yet". Onboarding measures what the
 *      client has done, and being handed an example is not doing it.
 *   2. **It must be unmistakably fake.** Names, addresses and emails are
 *      plainly invented, on `example.com` (reserved by RFC 2606, so mail can
 *      never reach a real person). A sample that looks like real inventory is
 *      one an agent might market, or mistake for a lead worth calling.
 */

/** Marks every record this module writes. Used to count and remove them. */
export const SAMPLE_MARKER = { isSample: true } as const;

/** Nobody is emailed or called: RFC 2606 reserves these for documentation. */
const SAMPLE_CONTACTS = [
  {
    name: "Sample — Dana Whitfield",
    email: "dana.whitfield@example.com",
    phone: "+15550100001",
    stageId: "qualified",
    dealTitle: "Sample — 3-bed listing consult",
    value: 12500,
  },
  {
    name: "Sample — Marcus Ellery",
    email: "marcus.ellery@example.com",
    phone: "+15550100002",
    stageId: "contacted",
    dealTitle: "Sample — Downsizing enquiry",
    value: 8200,
  },
  {
    name: "Sample — Priya Raman",
    email: "priya.raman@example.com",
    phone: "+15550100003",
    stageId: "new",
    dealTitle: "Sample — First-time buyer",
    value: 9400,
  },
  {
    name: "Sample — The Okonjo Family",
    email: "okonjo.family@example.com",
    phone: "+15550100004",
    stageId: "proposal",
    dealTitle: "Sample — Relocation package",
    value: 21000,
  },
  {
    name: "Sample — Ruth Vance",
    email: "ruth.vance@example.com",
    phone: "+15550100005",
    stageId: "won",
    dealTitle: "Sample — Closed: lakeside sale",
    value: 30500,
  },
] as const;

/**
 * A short worked conversation on the first sample contact, so the inbox is
 * legible too — an empty Conversations screen teaches as little as an empty
 * pipeline. Written to the SMS thread because that is the channel every
 * workspace has a surface for without connecting anything.
 */
const SAMPLE_THREAD = [
  {
    direction: "inbound" as const,
    body: "Hi! I saw the listing on Maple Street — is it still available?",
  },
  {
    direction: "outbound" as const,
    body: "It is. Would you like to see it this weekend? I have Saturday morning free.",
  },
  {
    direction: "inbound" as const,
    body: "Saturday works. 10am?",
  },
];

export interface SampleSeedResult {
  contacts: number;
  deals: number;
  conversations: number;
}

/**
 * Seed the example into a workspace. Best-effort by design: it runs during
 * sub-account creation, and a failed example must never stop a workspace from
 * being created. Callers log and continue.
 */
export async function seedSampleWorkspace(
  db: Firestore,
  params: { subAccountId: string; agencyId: string; createdByUid: string }
): Promise<SampleSeedResult> {
  const { subAccountId, agencyId, createdByUid } = params;
  const batch = db.batch();
  const now = FieldValue.serverTimestamp();
  const tenancy = { agencyId, subAccountId, createdByUid };

  let deals = 0;
  let conversations = 0;
  let firstContactId: string | null = null;
  let firstContactName = "";
  let firstContactPhone = "";
  for (const person of SAMPLE_CONTACTS) {
    const contactRef = db.collection("contacts").doc();
    batch.set(contactRef, {
      ...SAMPLE_MARKER,
      ...tenancy,
      name: person.name,
      email: person.email,
      phone: person.phone,
      company: "",
      address: "",
      source: "website",
      tags: ["sample"],
      pipelineStage: person.stageId,
      attribution: null,
      notes: "",
      createdAt: now,
      updatedAt: now,
    });

    if (!firstContactId) {
      firstContactId = contactRef.id;
      firstContactName = person.name;
      firstContactPhone = person.phone;
    }

    const dealRef = db.collection("deals").doc();
    batch.set(dealRef, {
      ...SAMPLE_MARKER,
      ...tenancy,
      title: person.dealTitle,
      value: person.value,
      currency: "USD",
      contactId: contactRef.id,
      stageId: person.stageId,
      priority: "medium",
      lostReason: null,
      createdAt: now,
      updatedAt: now,
    });
    deals += 1;
  }

  // The example conversation, on the first sample contact. Messages carry the
  // marker too, so removing the sample data takes the thread with it.
  if (firstContactId) {
    const contactRef = db.collection("contacts").doc(firstContactId);
    SAMPLE_THREAD.forEach((message, index) => {
      batch.set(contactRef.collection("messages").doc(), {
        ...SAMPLE_MARKER,
        ...tenancy,
        contactId: firstContactId,
        direction: message.direction,
        status: message.direction === "inbound" ? "received" : "delivered",
        body: message.body,
        from: message.direction === "inbound" ? firstContactPhone : "",
        to: message.direction === "inbound" ? "" : firstContactPhone,
        twilioMessageSid: null,
        sentByUid: null,
        error: null,
        // Spaced a minute apart so the thread reads in order rather than
        // collapsing onto one server timestamp.
        createdAt: new Date(
          Date.now() - (SAMPLE_THREAD.length - index) * 60000
        ),
        readAt: null,
      });
    });

    batch.set(db.collection("conversations").doc(firstContactId), {
      ...SAMPLE_MARKER,
      ...tenancy,
      contactId: firstContactId,
      contactName: firstContactName,
      contactPhone: firstContactPhone,
      channelsSeen: ["sms"],
      lastChannel: "sms",
      lastDirection: "inbound",
      lastMessagePreview: SAMPLE_THREAD[SAMPLE_THREAD.length - 1].body,
      lastMessageAt: new Date(),
      unreadCount: 1,
      status: "open",
      assigneeUid: null,
      // "off", not the usual "auto": the AI must never reply to a fictional
      // lead. That would spend the workspace's model budget on a conversation
      // with nobody, and put an invented exchange in the transcript.
      botMode: "off",
      botPausedUntil: null,
      pendingDraft: null,
      createdAt: now,
      updatedAt: now,
    });
    conversations = 1;
  }

  await batch.commit();
  return { contacts: SAMPLE_CONTACTS.length, deals, conversations };
}

/**
 * Remove every sample record from a workspace.
 *
 * Deletes only documents carrying the marker, so a client who has started
 * working in the example's company keeps everything they made themselves.
 */
export async function removeSampleWorkspace(
  db: Firestore,
  subAccountId: string
): Promise<SampleSeedResult> {
  const counts: SampleSeedResult = { contacts: 0, deals: 0, conversations: 0 };
  for (const collection of ["contacts", "deals", "conversations"] as const) {
    const snap = await db
      .collection(collection)
      .where("subAccountId", "==", subAccountId)
      .where("isSample", "==", true)
      .get();

    // `recursiveDelete` for contacts, a plain delete for the rest: a contact
    // owns subcollections (the sample message thread lives under it) and
    // Firestore does not cascade, so a batch delete would leave the messages
    // behind as orphans no screen can reach or remove.
    if (collection === "contacts") {
      for (const doc of snap.docs) await db.recursiveDelete(doc.ref);
    } else {
      // Chunked: a batch is capped at 500 writes. The example is small, but
      // nothing here should break if it ever grows.
      for (let i = 0; i < snap.docs.length; i += 400) {
        const batch = db.batch();
        for (const doc of snap.docs.slice(i, i + 400)) batch.delete(doc.ref);
        await batch.commit();
      }
    }
    counts[collection] = snap.size;
  }
  return counts;
}
