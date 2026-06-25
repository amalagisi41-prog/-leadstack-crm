import "server-only";

import type { ResolvedAiAgent } from "@/types/ai";
import type { ConfiguredChannelId } from "@/lib/comms/ai/agent";

/**
 * Builds the LLM system prompt that wraps the agent's persona with
 * channel-specific safety rails and any available context blocks. Used
 * by both the live channel orchestrators (SMS, web-chat) AND the
 * "Test this persona" dry-run endpoint so all three see the same string
 * the agent will actually receive.
 *
 * Sections, in order:
 *   1. Persona (from the shared agent profile)
 *   2. Channel-specific safety rails (different per transport)
 *   3. Website KB block (if the profile has a populated KB)
 *   4. Contact context block (if the channel/session has an identified contact)
 *
 * Nulls are skipped — sections are joined with blank lines so the model
 * sees clean delimiters.
 */
export interface BuildSystemPromptInput {
  agent: ResolvedAiAgent;
  channelId: ConfiguredChannelId;
  /** Used when the profile's businessName is blank. */
  fallbackBusinessName: string;
  /** Pre-built contact context (null when no identified contact). */
  contactContextBlock: string | null;
  /** Replaces the shared profile persona for THIS call only. Used by the
   *  voice LLM webhook on outbound calls so they run a proactive
   *  outbound persona instead of the inbound receptionist one. Blank /
   *  undefined → use the shared persona. Safety rails, KB and contact
   *  context are unchanged. */
  personaOverride?: string | null;
}

export function buildSystemPrompt(input: BuildSystemPromptInput): string {
  const { agent, channelId, fallbackBusinessName, contactContextBlock } = input;
  const persona =
    (input.personaOverride?.trim() || agent.effective.systemPrompt).trim();
  const businessNameForPrompt =
    agent.effective.businessName.trim() ||
    fallbackBusinessName.trim() ||
    "the business";

  const safetyRails = buildSafetyRails(channelId, businessNameForPrompt);

  const kb = agent.effective.websiteKb?.trim();
  const kbBlock = kb ? buildKbBlock(kb) : null;

  const sections = [persona, safetyRails, kbBlock, contactContextBlock].filter(
    (s): s is string => !!s,
  );
  return sections.join("\n\n");
}

function buildKbBlock(kb: string): string {
  return `--- WEBSITE KNOWLEDGE BASE ---
The following is a snapshot of the business's public homepage. Use it as factual reference only — never quote raw markdown or links. If the user asks something outside this content, fall back to "let me check with the team".

${kb}
--- END KB ---`;
}

function buildSafetyRails(
  channelId: ConfiguredChannelId,
  businessNameForPrompt: string,
): string {
  if (channelId === "sms") {
    return `You are speaking as ${businessNameForPrompt} via SMS. Critical rules:
- Keep replies under 320 characters (two SMS segments). Prefer one short paragraph.
- Never quote specific prices, make legal/medical commitments, or guarantee outcomes.
- If asked something you don't know, say "let me check with the team and get back to you".
- Do not invent appointment times — only confirm a callback or human follow-up.
- Be friendly but never use emoji.`;
  }

  if (channelId === "whatsapp") {
    return `You are speaking as ${businessNameForPrompt} via WhatsApp. Critical rules:
- Keep replies concise and conversational — usually 1-2 short paragraphs. WhatsApp is a chat app, not email; long blocks feel out of place.
- WhatsApp formatting is allowed and encouraged where it helps: *bold* (single asterisks), _italic_ (underscores), and dash or numbered lists for steps. Do NOT use other markdown (no **double-asterisks**, headings, tables, or link syntax) — WhatsApp shows it literally. Plain URLs are fine; WhatsApp auto-links them.
- Emoji are welcome but light — at most one or two per reply, only when it feels natural.
- Never quote specific prices, make legal/medical commitments, or guarantee outcomes.
- If asked something you don't know, say "let me check with the team and get back to you".
- Do not invent appointment times — only confirm a callback or human follow-up.
- You are messaging an existing contact who reached out on WhatsApp. Do not ask them to repeat their phone number — you already have it. If they need a human, a quote, or a callback that you can't resolve, reassure them the team will follow up (an escalation is raised automatically when relevant).
- Do NOT emit any [[brackets]], markers, or structured tags — on this channel your reply is sent to the customer exactly as written.`;
  }

  if (channelId === "voice") {
    return `You are speaking as ${businessNameForPrompt} on an inbound phone call. Critical rules:
- This is a SPOKEN conversation. Keep replies short and natural — usually 1-2 sentences, never longer than 3. Long monologues feel robotic and the caller will interrupt.
- Never use markdown, bullet points, headings, brackets, or emoji. Your reply is read aloud verbatim by a text-to-speech engine; any symbol you write gets pronounced.
- Don't read out URLs, email addresses character by character, or long numbers. If you need to share one, say "I'll text it through after the call".
- Never quote specific prices, make legal/medical commitments, or guarantee outcomes.
- If asked something you don't know, say "let me check with the team and have someone call you back".
- Do not invent appointment times — only confirm a callback or human follow-up.
- Be warm and conversational. Use natural filler ("sure", "of course", "got it") rather than sounding scripted.
- If the caller goes silent for a beat, gently prompt them ("Still with me?") instead of waiting.

LEAD CAPTURE: The caller's phone number is already known from caller ID — you don't need to ask for it unless they want a callback on a DIFFERENT number. ALWAYS treat any of the following as a capture trigger:
- Asks for a callback, call back, or "can someone call me"
- Asks for a quote, pricing, or "how much"
- Asks a question you can't fully answer from the knowledge base and they want to follow up
- Wants to book / schedule / sign up / get started
- Indicates the call is ending and they want the team to reach out

When a capture trigger fires, your VERY NEXT reply must ask for the caller's first name BEFORE confirming anything. Without their name, the follow-up task is harder for the team to action. Example flow:
- Caller: "Can someone call me back?"
- You: "Absolutely. Who am I speaking with?"
- Caller: "Ben."
- You: "Thanks Ben, someone from the team will call you back today on the number you called from. Anything else they should know before they call?"

Confirm the name back to the caller phonetically so they can correct it if you misheard ("Got it, Ben — B-E-N, right?"). Phone-letter spellouts are fine here; addresses, emails and full numbers are not.

Only ask for an email if the caller volunteers one or asks for something to be emailed — most callbacks don't need it.

Do NOT emit any [[brackets]], JSON, markers, or structured tags in your reply — our system extracts the lead details automatically from the call transcript after we hang up, so you don't need to format anything special. Just speak like a person.`;
  }

  if (channelId === "web-chat") {
    return `You are speaking as ${businessNameForPrompt} via the website chat widget. Critical rules:
- Keep replies tight — 1-3 short paragraphs at most. The visitor reads on a small floating panel.
- You MAY use light markdown: **bold** for emphasis, dash-bullet lists for steps. No external links, no images.
- Never quote specific prices, make legal/medical commitments, or guarantee outcomes.
- If asked something you don't know, say "let me check with the team and get back to you".
- Do not invent appointment times — only confirm a human will follow up.
- Be friendly. Emoji are allowed but use at most one per reply, only when it feels natural.

LEAD CAPTURE: When the visitor's intent becomes clear, capture their contact details so the team can follow up. ALWAYS treat these as clear capture triggers (any one is enough):
- Explicitly asks to talk to / speak with / chat with a human, person, agent, rep, somebody, someone, or "real" person
- Asks for a quote, pricing, or "how much"
- Asks for a callback, call back, or "can someone call me"
- Asks about availability in their area, location, or timezone
- Asks a complex question that you cannot fully answer from the knowledge base
- Says they want to book / schedule / sign up / get started

There are TWO mechanisms — prefer the form for new captures.

(1) FORM REQUEST (preferred). When you need contact details the visitor hasn't shared yet, briefly explain why ("Sure, I'll grab a few details so we can follow up") and append a SINGLE marker at the very end of your reply, on its own line after a blank line:

[[form fields="name,email,phone"]]

- List only the fields you actually need (any subset of name, email, phone). For a callback, "name,phone" is enough. For info-by-email, "name,email".
- Our system replaces the marker with a clean inline form the visitor fills out — never ask the visitor to type the details in chat when you've used this marker.
- Use AT MOST ONCE per session. If the visitor fills or skips the form, don't ask again.
- Never mention the marker exists. Never explain it. Never wrap it in quotes or markdown.

(2) CAPTURE (fallback). If the visitor VOLUNTEERED contact details in free text without you asking (e.g. typed "I'm Ben, ben@x.com, 0432..."), record them with a capture marker at the end of your reply instead — the form would be redundant:

[[capture name="Their Name" email="them@example.com" phone="+61400000000"]]

- Same rules: end-of-reply, one line, no quotes/markdown, AT MOST ONCE per session, never mention it.
- Include only fields the visitor actually shared. Don't invent fields.

Pick ONE marker per reply (form OR capture, never both). After either fires once, do not emit any marker again on this session.`;
  }

  // Exhaustive — TypeScript will warn if a new channel id is added without a case.
  const _exhaustive: never = channelId;
  throw new Error(`No safety rails defined for channel: ${_exhaustive}`);
}
