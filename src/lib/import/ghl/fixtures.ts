/**
 * Fixtures + offline checks for the GHL transformers (Phase 4, Slice 1).
 *
 * No live GHL account needed. `runGhlTransformChecks()` is a pure,
 * dependency-free verifier (returns a list of failures) — wired into the
 * project's CI test harness when it lands, and runnable ad hoc. Keeping the
 * fixtures + expectations here documents the exact GHL response shapes the
 * connector relies on.
 */

import {
  ghlContactToChunk,
  ghlNoteToChunk,
  ghlOpportunityToChunk,
  suggestCustomFields,
  suggestStageMap,
  type GhlContact,
  type GhlCustomFieldDef,
  type GhlImportMapping,
  type GhlNote,
  type GhlOpportunity,
  type GhlPipeline,
} from "@/lib/import/ghl/transform";

export const SAMPLE_PIPELINES: GhlPipeline[] = [
  {
    id: "pl_sales",
    name: "Sales",
    stages: [
      { id: "s_new", name: "New Lead" },
      { id: "s_contacted", name: "Contacted" },
      { id: "s_proposal", name: "Proposal Sent" },
      { id: "s_won", name: "Closed Won" },
      { id: "s_lost", name: "Closed Lost" },
    ],
  },
];

export const SAMPLE_CUSTOM_FIELDS: GhlCustomFieldDef[] = [
  {
    id: "cf_industry",
    name: "Industry",
    fieldKey: "contact.industry",
    dataType: "SINGLE_OPTIONS",
    picklistOptions: ["Plumbing", "Electrical"],
    model: "contact",
  },
  {
    id: "cf_jobsize",
    name: "Job Size",
    fieldKey: "opportunity.job_size",
    dataType: "NUMERICAL",
    model: "opportunity",
  },
];

export const SAMPLE_CONTACT: GhlContact = {
  id: "C1",
  firstName: "Jane",
  lastName: "Doe",
  email: "jane@example.com",
  phone: "+15551234567",
  companyName: "Acme",
  address1: "1 Main St",
  city: "Austin",
  state: "TX",
  tags: ["lead", "warm"],
  source: "Facebook",
  customFields: [{ id: "cf_industry", value: "Plumbing" }],
};

export const SAMPLE_OPPS: GhlOpportunity[] = [
  {
    id: "O1",
    name: "Website rebuild",
    contactId: "C1",
    pipelineId: "pl_sales",
    pipelineStageId: "s_proposal",
    status: "open",
    monetaryValue: 5000,
    customFields: [{ id: "cf_jobsize", value: 3 }],
  },
  {
    id: "O2",
    name: "Won deal",
    contactId: "C1",
    pipelineId: "pl_sales",
    pipelineStageId: "s_contacted", // status overrides this
    status: "won",
    monetaryValue: 1200,
  },
];

export const SAMPLE_NOTE: GhlNote = {
  id: "N1",
  body: "Called and left a voicemail.",
  contactId: "C1",
  dateAdded: "2026-01-15T10:00:00.000Z",
};

/** Build a mapping the way the wizard would (auto-suggest + create). */
export function sampleMapping(): GhlImportMapping {
  const suggested = suggestCustomFields(SAMPLE_CUSTOM_FIELDS);
  return {
    stageMap: suggestStageMap(SAMPLE_PIPELINES),
    defaultStage: "new",
    defaultCurrency: "USD",
    customFields: Object.fromEntries(
      suggested.map((s) => [
        s.ghlId,
        {
          ghlId: s.ghlId,
          ghlName: s.ghlName,
          // Wizard would generate a key from the label; fixture uses a slug.
          leadstackKey: s.label.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
        },
      ]),
    ),
  };
}

/** Pure verifier — returns a list of failure messages (empty = all good). */
export function runGhlTransformChecks(): string[] {
  const fails: string[] = [];
  const eq = (label: string, got: unknown, want: unknown) => {
    if (JSON.stringify(got) !== JSON.stringify(want)) {
      fails.push(`${label}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
    }
  };

  const mapping = sampleMapping();

  // Stage suggestions
  eq("stage New Lead", mapping.stageMap.s_new, "new");
  eq("stage Contacted", mapping.stageMap.s_contacted, "contacted");
  eq("stage Proposal Sent", mapping.stageMap.s_proposal, "proposal");
  eq("stage Closed Won", mapping.stageMap.s_won, "won");
  eq("stage Closed Lost", mapping.stageMap.s_lost, "lost");

  // Contact
  const c = ghlContactToChunk(SAMPLE_CONTACT, mapping);
  eq("contact external_id", c.external_id, "C1");
  eq("contact name", c.name, "Jane Doe");
  eq("contact company", c.company, "Acme");
  eq("contact address", c.address, "1 Main St, Austin, TX");
  eq("contact tags", c.tags, ["lead", "warm"]);
  eq("contact custom industry", c.custom_fields.industry, "Plumbing");

  // Opportunity — open uses the stage map…
  const o1 = ghlOpportunityToChunk(SAMPLE_OPPS[0], mapping);
  eq("opp1 contact_external_id", o1.contact_external_id, "C1");
  eq("opp1 value", o1.value, 5000);
  eq("opp1 stage", o1.stage, "proposal");
  eq("opp1 custom job_size", o1.custom_fields.job_size, 3);
  // …won status overrides the mapped stage.
  const o2 = ghlOpportunityToChunk(SAMPLE_OPPS[1], mapping);
  eq("opp2 stage (won status overrides)", o2.stage, "won");

  // Note
  const n = ghlNoteToChunk(SAMPLE_NOTE);
  eq("note external_id", n.external_id, "N1");
  eq("note contact_external_id", n.contact_external_id, "C1");
  eq("note content", n.content, "Called and left a voicemail.");

  return fails;
}
