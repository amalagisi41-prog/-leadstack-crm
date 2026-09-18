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

export interface SampleSeedResult {
  contacts: number;
  deals: number;
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

  await batch.commit();
  return { contacts: SAMPLE_CONTACTS.length, deals };
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
  const counts: SampleSeedResult = { contacts: 0, deals: 0 };
  for (const collection of ["contacts", "deals"] as const) {
    const snap = await db
      .collection(collection)
      .where("subAccountId", "==", subAccountId)
      .where("isSample", "==", true)
      .get();
    // Chunked: a batch is capped at 500 writes, and the example is small, but
    // nothing here should break if it ever grows.
    for (let i = 0; i < snap.docs.length; i += 400) {
      const batch = db.batch();
      for (const doc of snap.docs.slice(i, i + 400)) batch.delete(doc.ref);
      await batch.commit();
    }
    counts[collection] = snap.size;
  }
  return counts;
}
