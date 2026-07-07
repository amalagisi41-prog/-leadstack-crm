import {
  BRAND_VOICES,
  DEFAULT_AGENTSTACK_LOGO_SHEET_URL,
  SERVICE_SPECIALTIES,
  type BusinessProfileContent,
} from "@/types/business-profile";

/**
 * Pure helpers that turn the structured Business Profile into (a) the text
 * block every AI agent reads and (b) a completeness score for the onboarding
 * UI. No I/O — safe to unit-test and to import on client or server.
 */

function labelForVoice(id: string): string {
  return BRAND_VOICES.find((v) => v.id === id)?.label ?? "Professional";
}

function labelsForServices(ids: string[]): string {
  return ids
    .map((id) => SERVICE_SPECIALTIES.find((s) => s.id === id)?.label ?? id)
    .join(", ");
}

/** A labelled line, only when the value is non-empty. */
function line(label: string, value: string | undefined | null): string | null {
  const v = (value ?? "").trim();
  return v ? `${label}: ${v}` : null;
}

/**
 * Compile the profile into a compact system-prompt block. Returns null when
 * the profile is effectively empty so the prompt builder can skip the section
 * entirely. Kept tight (labelled lines, no prose) so it costs few tokens on
 * every AI turn across every channel.
 */
export function compileBusinessProfilePrompt(
  p: BusinessProfileContent,
): string | null {
  // Guardrails + brand voice are defaults that ride along with a real
  // profile — they must NOT, on their own, cause a near-empty block to be
  // injected into every AI turn. Require at least one substantive field the
  // operator actually typed before emitting anything.
  const hasSubstance =
    [
      p.agentName,
      p.brokerage,
      p.licenseStates,
      p.licenseNumber,
      p.phone,
      p.email,
      p.website,
      p.languages,
      p.serviceAreas,
      p.priceRanges,
      p.specialties,
      p.businessHours,
      p.responsePreference,
      p.handoffRules,
      p.escalationRules,
      p.qualificationRules,
      p.brokerageDisclosure,
      p.bio,
      p.buyerGuideUrl,
      p.sellerGuideUrl,
      p.vendors,
      p.testimonials,
    ].some((v) => (v ?? "").trim().length > 0) ||
    p.services.length > 0 ||
    p.faqs.some((f) => f.q.trim() && f.a.trim());
  if (!hasSubstance) return null;

  const identity = [
    line("Agent", p.agentName),
    line("Brokerage", p.brokerage),
    line("Licensed in", p.licenseStates),
    line("Phone", p.phone),
    line("Email", p.email),
    line("Website", p.website),
    line("Languages", p.languages),
  ].filter(Boolean);

  const market = [
    line("Service areas", p.serviceAreas),
    line("Typical price ranges", p.priceRanges),
    line(
      "Services",
      p.services.length ? labelsForServices(p.services) : "",
    ),
    line("Specialties", p.specialties),
  ].filter(Boolean);

  const rules = [
    line("Brand voice", labelForVoice(p.brandVoice)),
    line("Business hours", p.businessHours),
    line("Lead response preference", p.responsePreference),
    line("Hand off to a human when", p.handoffRules),
    line("Escalate (alert the agent) when", p.escalationRules),
    line("Qualify leads on", p.qualificationRules),
  ].filter(Boolean);

  const compliance: string[] = [];
  if (p.fairHousing) {
    compliance.push(
      "Follow Fair Housing at all times — never steer, never reference or imply preferences about race, color, religion, sex, disability, familial status, or national origin.",
    );
  }
  if (p.noLegalTaxAdvice) {
    compliance.push(
      "Never give legal, tax, or financial advice — recommend the appropriate licensed professional instead.",
    );
  }
  if (p.brokerageDisclosure.trim()) {
    compliance.push(`Required disclosure: ${p.brokerageDisclosure.trim()}`);
  }
  if (p.optOutLanguage.trim()) {
    compliance.push(`Opt-out language: ${p.optOutLanguage.trim()}`);
  }

  const assets = [
    line("Agent bio", p.bio),
    line(
      "Brand logo sheet",
      p.logoUrl || DEFAULT_AGENTSTACK_LOGO_SHEET_URL,
    ),
    line("Buyer guide link", p.buyerGuideUrl),
    line("Seller guide link", p.sellerGuideUrl),
    line("Preferred vendors", p.vendors),
    line("Testimonials", p.testimonials),
  ].filter(Boolean);

  const faqs = p.faqs
    .filter((f) => f.q.trim() && f.a.trim())
    .map((f) => `Q: ${f.q.trim()}\nA: ${f.a.trim()}`);

  const groups: string[] = [];
  if (identity.length) groups.push(identity.join("\n"));
  if (market.length) groups.push(market.join("\n"));
  if (rules.length) groups.push(rules.join("\n"));
  if (compliance.length)
    groups.push(`Compliance guardrails (never break these):\n- ${compliance.join("\n- ")}`);
  if (assets.length) groups.push(assets.join("\n"));
  if (faqs.length)
    groups.push(`Approved FAQ answers (you may use these directly):\n${faqs.join("\n\n")}`);

  if (groups.length === 0) return null;

  return `--- AGENT BUSINESS PROFILE ---
This is the agent's business playbook. Treat it as authoritative fact about who you represent. Speak as this agent, honor the rules and compliance guardrails, and use these details when relevant. If asked something not covered here, say you'll check with the agent and follow up.

${groups.join("\n\n")}
--- END BUSINESS PROFILE ---`;
}

/**
 * A rough 0–100 completeness score. Weighted toward the fields that matter
 * most to grounding the AI. Drives the onboarding "Business Profile: 70%
 * complete" indicator.
 */
export function businessProfileCompleteness(p: BusinessProfileContent): number {
  const checks: boolean[] = [
    !!p.agentName.trim(),
    !!p.brokerage.trim(),
    !!p.licenseStates.trim(),
    !!(p.phone.trim() || p.email.trim()),
    !!p.serviceAreas.trim(),
    p.services.length > 0,
    !!p.businessHours.trim(),
    !!p.qualificationRules.trim(),
    !!p.bio.trim(),
    p.faqs.some((f) => f.q.trim() && f.a.trim()),
  ];
  const done = checks.filter(Boolean).length;
  return Math.round((done / checks.length) * 100);
}
