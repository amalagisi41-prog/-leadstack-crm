import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import type { PipelineStageOverride } from "@/types/deals";
import type { MessageTemplateDoc } from "@/types/automations";

/**
 * Real-estate agent snapshot.
 *
 * Applies a fully pre-configured starting state to a newly provisioned
 * sub-account so the agent logs in to a working system, not a blank slate.
 *
 * What gets written:
 *   - Pipeline stage labels tuned for real estate
 *   - 4 email templates (speed-to-lead, day-3 follow-up, day-7 follow-up,
 *     showing confirmation)
 *   - 2 SMS templates (instant lead response, follow-up nudge)
 *   - AI agent persona for a generic CT realtor
 *
 * Safe to call multiple times — each write either sets or overwrites, so
 * re-applying won't create duplicates. Email/SMS templates are written
 * with stable doc ids (prefixed "snapshot_") so re-runs are idempotent.
 */

// ─── Pipeline ────────────────────────────────────────────────────────────────

const REAL_ESTATE_STAGES: PipelineStageOverride[] = [
  { id: "new",       label: "New Lead",         order: 0 },
  { id: "contacted", label: "Contacted",         order: 1 },
  { id: "qualified", label: "Showing Scheduled", order: 2 },
  { id: "proposal",  label: "Offer Made",        order: 3 },
  { id: "won",       label: "Closed",            order: 4 },
  { id: "lost",      label: "Lost",              order: 5 },
];

// ─── Email templates ──────────────────────────────────────────────────────────

const EMAIL_TEMPLATES: Array<Omit<MessageTemplateDoc, "id" | "agencyId" | "subAccountId" | "createdByUid" | "createdAt" | "updatedAt">> = [
  {
    type: "email",
    name: "Speed-to-Lead: Instant Response",
    subject: "{{firstName}}, I got your inquiry — let's connect",
    body: `Hi {{firstName}},

Thanks for reaching out! I'm {{agentName}} and I'd love to help you with your real estate goals in Connecticut.

I'll give you a call within the next few minutes. If now isn't a great time, just reply to this email and let me know when works best.

A few things that might help in the meantime:
• Browse active listings: {{websiteUrl}}
• My direct line: {{agentPhone}}

Looking forward to connecting,
{{agentName}}
{{businessName}}

---
{{unsubscribeLink}}`,
  },
  {
    type: "email",
    name: "Follow-Up: Day 3",
    subject: "Still thinking about buying or selling in CT?",
    body: `Hi {{firstName}},

I wanted to follow up from my earlier message. The CT market is moving quickly right now — properties in your target area are seeing strong activity.

Whether you're 30 days out or just starting to explore, I'm happy to put together a no-pressure market snapshot for you.

Just reply or call me at {{agentPhone}} — takes 10 minutes and you'll leave knowing exactly what your options look like.

{{agentName}}
{{businessName}}

---
{{unsubscribeLink}}`,
  },
  {
    type: "email",
    name: "Follow-Up: Day 7",
    subject: "One last note, {{firstName}}",
    body: `Hi {{firstName}},

I don't want to keep filling your inbox, so this will be my last check-in for now.

If your timeline has changed or you're ready to take the next step, my door is always open:
📞 {{agentPhone}}
📧 Reply to this email

I work with buyers and sellers across Connecticut and would love the chance to earn your business when the time is right.

{{agentName}}
{{businessName}}

---
{{unsubscribeLink}}`,
  },
  {
    type: "email",
    name: "Showing Confirmation",
    subject: "You're confirmed — showing at {{propertyAddress}}",
    body: `Hi {{firstName}},

Your showing is confirmed. Here are the details:

📍 {{propertyAddress}}
📅 {{showingDate}} at {{showingTime}}

I'll meet you at the property. A few things to know:
• Bring a valid photo ID
• We'll have about 30–45 minutes
• Feel free to take photos and notes

Questions before we meet? Call or text me at {{agentPhone}}.

See you soon,
{{agentName}}
{{businessName}}

---
{{unsubscribeLink}}`,
  },
];

// ─── SMS templates ────────────────────────────────────────────────────────────

const SMS_TEMPLATES: Array<Omit<MessageTemplateDoc, "id" | "agencyId" | "subAccountId" | "createdByUid" | "createdAt" | "updatedAt">> = [
  {
    type: "sms",
    name: "Speed-to-Lead: Instant SMS",
    subject: null,
    body: `Hi {{firstName}}, this is {{agentName}} from {{businessName}}. I just got your inquiry and I'm giving you a call now. If I miss you, reply here and let me know a good time. Talk soon!`,
  },
  {
    type: "sms",
    name: "Follow-Up Nudge",
    subject: null,
    body: `Hey {{firstName}}, just checking in — {{agentName}} from {{businessName}}. Still thinking about buying or selling in CT? Happy to chat whenever works for you. 📞 {{agentPhone}}`,
  },
];

// ─── AI agent persona ─────────────────────────────────────────────────────────

const AI_PERSONA_PROMPT = `You are a helpful real estate assistant for {{businessName}}, a Connecticut-based real estate agency. Your job is to respond to inbound leads quickly, qualify their interest, and book a call or showing with the agent.

When someone reaches out:
1. Greet them warmly and ask what they're looking for (buying, selling, or both)
2. Find out their timeline (30 days, 3 months, just exploring)
3. Ask for their preferred areas or neighborhoods in CT
4. If they're buying, ask their budget range
5. If they're selling, ask for the property address to pull a quick valuation
6. Offer to connect them with the agent for a 10-minute call

Keep responses concise and conversational. Never make up property listings, prices, or market data. If they ask something you don't know, say "Let me have the agent get back to you on that — I'll make sure they reach out within the hour."

Always be warm, professional, and focused on getting them to the next step: a call or showing.`;

// ─── Apply snapshot ───────────────────────────────────────────────────────────

export async function applyRealEstateSnapshot(
  subAccountId: string,
  agencyId: string,
  createdByUid: string,
  options?: { businessName?: string; agentName?: string },
): Promise<{ templatesWritten: number }> {
  const db = getAdminDb();
  const now = FieldValue.serverTimestamp();
  const batch = db.batch();

  // 1. Pipeline stage labels
  const saRef = db.collection("subAccounts").doc(subAccountId);
  batch.update(saRef, { pipelineStages: REAL_ESTATE_STAGES });

  // 2. Email + SMS templates (stable ids so re-apply is idempotent)
  const allTemplates = [...EMAIL_TEMPLATES, ...SMS_TEMPLATES];
  for (const tpl of allTemplates) {
    const safeKey = tpl.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .slice(0, 40);
    const docId = `snapshot_${safeKey}`;
    const ref = db.collection("message_templates").doc(docId);
    batch.set(ref, {
      ...tpl,
      id: docId,
      agencyId,
      subAccountId,
      createdByUid,
      createdAt: now,
      updatedAt: now,
    } satisfies MessageTemplateDoc, { merge: true });
  }

  // 3. AI agent persona
  const profileRef = db
    .collection("subAccounts")
    .doc(subAccountId)
    .collection("aiAgent")
    .doc("profile");

  const businessName = options?.businessName ?? "";
  batch.set(
    profileRef,
    {
      systemPrompt: AI_PERSONA_PROMPT,
      businessName,
      hoursStart: 8,
      hoursEnd: 20,
      timezone: "America/New_York",
      escalationKeywords: [
        "speak to someone",
        "talk to a person",
        "call me now",
        "urgent",
        "emergency",
        "not happy",
        "complaint",
      ],
      escalationNotifyEmail: null,
      websiteUrl: null,
      websiteKb: null,
      websiteKbFetchedAt: null,
      createdAt: now,
      updatedAt: now,
    },
    { merge: true },
  );

  await batch.commit();

  return { templatesWritten: allTemplates.length };
}
